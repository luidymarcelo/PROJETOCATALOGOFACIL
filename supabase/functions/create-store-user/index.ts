import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Usuário administrador não autenticado.");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Sessão administrativa inválida.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await request.json();
    const tenantId = String(body.tenant_id ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    if (!tenantId || !email || password.length < 6 || !name) throw new Error("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");

    const { data: tenant } = await adminClient.from("tenants").select("id").eq("id", tenantId).single();
    if (!tenant) throw new Error("Empresa não encontrada.");
    const { data: membership } = await adminClient.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", userData.user.id).in("role", ["owner", "admin"]).maybeSingle();
    const { data: platformAdmin } = await adminClient.from("platform_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!membership && !platformAdmin) throw new Error("Seu usuário não tem permissão para criar acessos nesta filial.");

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    let managedUser = created.user;
    if (!managedUser && createError?.message.toLowerCase().includes("already registered")) {
      const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      managedUser = users.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
      if (managedUser) await adminClient.auth.admin.updateUserById(managedUser.id, { password, email_confirm: true, user_metadata: { full_name: name } });
    }
    if (!managedUser) throw new Error(createError?.message ?? "Não foi possível criar o usuário.");

    const { data: existingBusinessUser } = await adminClient.from("tenant_members").select("user_id").eq("tenant_id", tenantId).in("role", ["manager", "staff"]).neq("user_id", managedUser.id).maybeSingle();
    if (existingBusinessUser) throw new Error("Esta empresa já possui um usuário principal.");
    await adminClient.from("profiles").upsert({ id: managedUser.id, full_name: name });
    const { error: memberError } = await adminClient.from("tenant_members").upsert({ tenant_id: tenantId, user_id: managedUser.id, role: "manager" });
    if (memberError) throw new Error(memberError.message);

    return new Response(JSON.stringify({ user_id: managedUser.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao criar usuário." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
