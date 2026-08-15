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

    const { data: platformAdmin } = await adminClient.from("platform_admins").select("user_id").eq("user_id", caller.user.id).maybeSingle();
    if (!platformAdmin) throw new Error("Somente o administrador da plataforma pode gerenciar empresas.");

    if (body.action === "get-company-settings") {
      return await getCompanySettings(adminClient, String(body.tenant_id ?? ""));
    }

    if (body.action === "update-company-access") {
      return await updateCompanyAccess(adminClient, body);
    }

    if (body.action === "delete-company") {
      return await deleteCompany(adminClient, String(body.tenant_id ?? ""), String(body.confirmation ?? ""));
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    if (!email || password.length < 6 || !name) throw new Error("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");

    const managedUser = await ensureAuthUser(adminClient, email, password, name);
    const company = body.company;
    if (!company) throw new Error("Dados da empresa não informados.");

    const companyName = String(company.name ?? "").trim();
    const companySlug = String(company.slug ?? "").trim();
    const branchName = String(company.branch_name ?? "").trim();
    const branchSlug = String(company.branch_slug ?? "").trim();
    const whatsappPhone = String(company.whatsapp_phone ?? "").replace(/\D/g, "");
    const address = String(company.address ?? "").trim();
    const latitude = Number(company.latitude);
    const longitude = Number(company.longitude);
    const validLocation = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    if (!companyName || !companySlug || !branchName || !branchSlug || !whatsappPhone || !address || !validLocation) {
      if (managedUser.wasCreated) await adminClient.auth.admin.deleteUser(managedUser.id);
      throw new Error("Preencha todos os dados e uma localização válida para a primeira filial.");
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
      const { error: parameterError } = await adminClient.from("tenant_parameters").insert({
        tenant_id: tenant.id,
        parameter_key: "calculate_delivery_fee",
        parameter_value: true,
        is_public: true,
      });
      if (parameterError) throw parameterError;
      await adminClient.from("profiles").upsert({ id: managedUser.id, full_name: name });
      const { data: branch, error: branchError } = await adminClient.from("stores").insert({
        tenant_id: tenant.id,
        name: branchName,
        slug: branchSlug,
        segment: "retail",
        whatsapp_phone: whatsappPhone,
        address,
        latitude,
        longitude,
        is_active: true,
      }).select("id, name, slug, tenant_id, address, cover_image_url, latitude, longitude, delivery_fee").single();
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
    adminClient.from("stores").select("id, name, slug, tenant_id, whatsapp_phone, address, cover_image_url, latitude, longitude, minimum_order, delivery_fee, delivery_time_label, is_active").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
  ]);
  if (tenantError || !tenant) throw tenantError ?? new Error("Empresa não encontrada.");
  if (branchError) throw branchError;
  if (!branches?.length) return json({ error: "Esta empresa ainda não possui filial.", code: "company_branch_not_found" });

  return json({ tenant, branches });
}

async function getCompanySettings(adminClient: SupabaseClient, tenantId: string) {
  if (!tenantId) throw new Error("Empresa não informada.");
  const { data: tenant, error: tenantError } = await adminClient.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (tenantError || !tenant) throw tenantError ?? new Error("Empresa não encontrada.");

  const { data: members, error: memberError } = await adminClient
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["manager", "staff"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (memberError) throw memberError;
  const userId = members?.[0]?.user_id as string | undefined;
  if (!userId) return json({ account: null });

  const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
  if (authUserError || !authUser.user) throw authUserError ?? new Error("Usuário da empresa não encontrado.");
  const { data: profile } = await adminClient.from("profiles").select("full_name").eq("id", userId).maybeSingle();

  return json({
    account: {
      user_id: userId,
      email: authUser.user.email ?? "",
      name: profile?.full_name ?? authUser.user.user_metadata?.full_name ?? "",
    },
  });
}

async function updateCompanyAccess(adminClient: SupabaseClient, body: Record<string, unknown>) {
  const tenantId = String(body.tenant_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  if (!tenantId || !email || !name) throw new Error("Preencha o nome do responsável e o e-mail de acesso.");
  if (password && password.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");

  const { data: tenant, error: tenantError } = await adminClient.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (tenantError || !tenant) throw tenantError ?? new Error("Empresa não encontrada.");

  const { data: members, error: memberError } = await adminClient
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["manager", "staff"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (memberError) throw memberError;

  let userId = members?.[0]?.user_id as string | undefined;
  if (userId) {
    const { data: currentUser, error: currentUserError } = await adminClient.auth.admin.getUserById(userId);
    if (currentUserError || !currentUser.user) throw currentUserError ?? new Error("Usuário da empresa não encontrado.");
    const updates = {
      email,
      email_confirm: true,
      user_metadata: { ...currentUser.user.user_metadata, full_name: name },
      app_metadata: { ...currentUser.user.app_metadata, company_tenant_id: tenantId },
      ...(password ? { password } : {}),
    };
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, updates);
    if (updateError) throw updateError;
  } else {
    if (password.length < 6) throw new Error("Defina uma senha com pelo menos 6 caracteres para criar o acesso.");
    const existingUser = await findAuthUserByEmail(adminClient, email);
    if (existingUser) {
      const { data: otherMembership } = await adminClient
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", existingUser.id)
        .in("role", ["manager", "staff"])
        .neq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();
      if (otherMembership) throw new Error("Este e-mail já está vinculado a outra empresa.");
      userId = existingUser.id;
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { ...existingUser.user_metadata, full_name: name },
        app_metadata: { ...existingUser.app_metadata, company_tenant_id: tenantId },
      });
      if (updateError) throw updateError;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
        app_metadata: { company_tenant_id: tenantId },
      });
      if (createError || !created.user) throw createError ?? new Error("Não foi possível criar o acesso da empresa.");
      userId = created.user.id;
    }

    if (!userId) throw new Error("Não foi possível identificar o acesso da empresa.");
    const { error: membershipError } = await adminClient.from("tenant_members").upsert(
      { tenant_id: tenantId, user_id: userId, role: "manager" },
      { onConflict: "tenant_id,user_id" },
    );
    if (membershipError) throw membershipError;
  }

  if (!userId) throw new Error("Não foi possível identificar o acesso da empresa.");
  const { error: profileError } = await adminClient.from("profiles").upsert({ id: userId, full_name: name });
  if (profileError) throw profileError;
  return json({ account: { user_id: userId, email, name } });
}

async function deleteCompany(adminClient: SupabaseClient, tenantId: string, confirmation: string) {
  if (!tenantId) throw new Error("Empresa não informada.");
  const { data: tenant, error: tenantError } = await adminClient.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (tenantError || !tenant) throw tenantError ?? new Error("Empresa não encontrada.");
  if (confirmation.trim() !== tenant.name) throw new Error("O nome de confirmação não corresponde à empresa.");

  const { data: companyMembers, error: memberError } = await adminClient
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["manager", "staff"]);
  if (memberError) throw memberError;

  const usersToDelete: string[] = [];
  for (const member of companyMembers ?? []) {
    const [{ data: platformAdmin }, { count: otherCompanyCount }] = await Promise.all([
      adminClient.from("platform_admins").select("user_id").eq("user_id", member.user_id).maybeSingle(),
      adminClient
        .from("tenant_members")
        .select("tenant_id", { count: "exact", head: true })
        .eq("user_id", member.user_id)
        .in("role", ["manager", "staff"])
        .neq("tenant_id", tenantId),
    ]);
    if (!platformAdmin && !otherCompanyCount) usersToDelete.push(member.user_id);
  }

  const { error: deleteError } = await adminClient.from("tenants").delete().eq("id", tenantId);
  if (deleteError) throw deleteError;

  const authDeletionErrors: string[] = [];
  for (const userId of usersToDelete) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) authDeletionErrors.push(error.message);
  }

  return json({
    deleted: true,
    warning: authDeletionErrors.length ? "A empresa foi excluída, mas um usuário de autenticação não pôde ser removido." : null,
  });
}

async function findAuthUserByEmail(adminClient: SupabaseClient, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
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
