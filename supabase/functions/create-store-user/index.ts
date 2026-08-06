import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ManagedUser = { id: string; wasCreated: boolean };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Administrador não autenticado.");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: caller, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller.user) throw new Error("Sessão administrativa inválida.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await request.json();
    if (body.action === "get-company-workspace") {
      return await getCompanyWorkspace(adminClient, caller.user.id);
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    if (!email || password.length < 6 || !name) throw new Error("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");

    const { data: platformAdmin } = await adminClient.from("platform_admins").select("user_id").eq("user_id", caller.user.id).maybeSingle();
    if (!platformAdmin) throw new Error("Somente o administrador da plataforma pode criar empresas.");

    const managedUser = await ensureAuthUser(adminClient, email, password, name);
    const company = body.company;
    if (!company) throw new Error("Dados da empresa não informados.");

    const companyName = String(company.name ?? "").trim();
    const companySlug = String(company.slug ?? "").trim();
    const branchName = String(company.branch_name ?? "").trim();
    const branchSlug = String(company.branch_slug ?? "").trim();
    const whatsappPhone = String(company.whatsapp_phone ?? "").replace(/\D/g, "");
    const address = String(company.address ?? "").trim();
    if (!companyName || !companySlug || !branchName || !branchSlug || !whatsappPhone || !address) {
      if (managedUser.wasCreated) await adminClient.auth.admin.deleteUser(managedUser.id);
      throw new Error("Preencha todos os dados da empresa e da primeira filial.");
    }

    const { data: existingMembership } = await adminClient.from("tenant_members").select("tenant_id").eq("user_id", managedUser.id).in("role", ["manager", "staff"]).maybeSingle();
    if (existingMembership) throw new Error("Este e-mail já está vinculado a uma empresa.");

    const { data: tenant, error: tenantError } = await adminClient.from("tenants").insert({ name: companyName, slug: companySlug }).select("id, name, slug").single();
    if (tenantError || !tenant) {
      if (managedUser.wasCreated) await adminClient.auth.admin.deleteUser(managedUser.id);
      throw new Error(tenantError?.message ?? "Não foi possível criar a empresa.");
    }

    try {
      const { error: ownerError } = await adminClient.from("tenant_members").insert({ tenant_id: tenant.id, user_id: caller.user.id, role: "owner" });
      if (ownerError) throw ownerError;
      const { error: companyUserError } = await adminClient.from("tenant_members").insert({ tenant_id: tenant.id, user_id: managedUser.id, role: "manager" });
      if (companyUserError) throw companyUserError;
      await adminClient.from("profiles").upsert({ id: managedUser.id, full_name: name });
      const { data: branch, error: branchError } = await adminClient.from("stores").insert({
        tenant_id: tenant.id,
        name: branchName,
        slug: branchSlug,
        segment: "retail",
        whatsapp_phone: whatsappPhone,
        address,
        is_active: true,
      }).select("id, name, slug, tenant_id").single();
      if (branchError || !branch) throw branchError ?? new Error("Não foi possível criar a filial.");

      const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(managedUser.id);
      if (authUserError || !authUser.user) throw authUserError ?? new Error("Não foi possível confirmar o acesso da empresa.");
      const { error: metadataError } = await adminClient.auth.admin.updateUserById(managedUser.id, {
        app_metadata: { ...authUser.user.app_metadata, company_tenant_id: tenant.id },
      });
      if (metadataError) throw metadataError;

      return json({ tenant, branch, user_id: managedUser.id });
    } catch (databaseError) {
      await adminClient.from("tenants").delete().eq("id", tenant.id);
      if (managedUser.wasCreated) await adminClient.auth.admin.deleteUser(managedUser.id);
      throw databaseError;
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro ao criar empresa e acesso." });
  }
});

async function getCompanyWorkspace(adminClient: SupabaseClient, userId: string) {
  const { data: memberships, error: membershipError } = await adminClient
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .in("role", ["manager", "staff"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (membershipError) throw membershipError;

  let tenantId = memberships?.[0]?.tenant_id as string | undefined;

  if (!tenantId) {
    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
    if (authUserError) throw authUserError;
    tenantId = authUser.user?.app_metadata?.company_tenant_id as string | undefined;
  }

  if (!tenantId) {
    const { data: storeMemberships, error: storeMembershipError } = await adminClient
      .from("store_members")
      .select("store_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (storeMembershipError) throw storeMembershipError;

    const legacyStoreId = storeMemberships?.[0]?.store_id as string | undefined;
    if (legacyStoreId) {
      const { data: legacyStore, error: legacyStoreError } = await adminClient
        .from("stores")
        .select("tenant_id")
        .eq("id", legacyStoreId)
        .single();
      if (legacyStoreError) throw legacyStoreError;
      tenantId = legacyStore?.tenant_id as string | undefined;
    }
  }

  if (!tenantId) {
    return json({ error: "Este login não está vinculado a uma empresa.", code: "company_access_not_found" });
  }

  const { error: repairError } = await adminClient.from("tenant_members").upsert(
    { tenant_id: tenantId, user_id: userId, role: "manager" },
    { onConflict: "tenant_id,user_id" },
  );
  if (repairError) throw repairError;

  const [{ data: tenant, error: tenantError }, { data: branches, error: branchError }] = await Promise.all([
    adminClient.from("tenants").select("id, name, slug").eq("id", tenantId).single(),
    adminClient.from("stores").select("id, name, slug, tenant_id").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
  ]);
  if (tenantError || !tenant) throw tenantError ?? new Error("Empresa não encontrada.");
  if (branchError) throw branchError;
  if (!branches?.length) return json({ error: "Esta empresa ainda não possui filial.", code: "company_branch_not_found" });

  return json({ tenant, branches });
}

async function ensureAuthUser(adminClient: SupabaseClient, email: string, password: string, name: string): Promise<ManagedUser> {
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (created.user) return { id: created.user.id, wasCreated: true };

  if (!createError?.message.toLowerCase().includes("already registered")) {
    throw new Error(createError?.message ?? "Não foi possível criar o usuário da empresa.");
  }

  const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(usersError.message);
  const existing = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!existing) throw new Error("O e-mail já existe, mas o usuário não pôde ser localizado.");
  const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { full_name: name } });
  if (updateError) throw new Error(updateError.message);
  return { id: existing.id, wasCreated: false };
}

function json(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
