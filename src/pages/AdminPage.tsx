import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, Users, Shield, ListChecks, UserPlus, UserX, Ban } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import StatusBadge from "@/components/StatusBadge";

// ---- Types ----
type Profile = Tables<"profiles">;
type Group = Tables<"groups"> & { consultants?: { name: string } | null };
type UserRole = Tables<"user_roles"> & { groups?: { name: string } | null };
type GroupPermission = Tables<"group_permissions">;
interface LookupValue { id: string; category: string; value: string; label: string; sort_order: number; is_active: boolean; }

const APP_ROLES = ["superadmin", "admin", "pmc_user", "pmc_reviewer", "aldar_team", "viewer"] as const;
const MODULES = ["consultants", "employees", "projects", "framework_agreements", "service_orders", "purchase_orders", "invoices", "positions", "deployments", "period_control"] as const;
const PERMISSIONS = ["no_access", "read", "modify"] as const;

export default function AdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Admin Panel</h1><p className="page-subtitle">Users, groups, permissions, and system configuration</p></div>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="users"><Users size={14} className="mr-1.5" />Users</TabsTrigger>
            <TabsTrigger value="groups"><Shield size={14} className="mr-1.5" />Groups & Permissions</TabsTrigger>
            <TabsTrigger value="lookups"><ListChecks size={14} className="mr-1.5" />Lookup Values</TabsTrigger>
          </TabsList>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="groups"><GroupsTab /></TabsContent>
          <TabsContent value="lookups"><LookupsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// =============== USERS TAB ===============
function UsersTab() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [roleForm, setRoleForm] = useState({ group_id: "", role: "pmc_user" as string });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", full_name: "", consultant_id: "", group_id: "", role: "pmc_user" });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", consultant_id: "", status: "active" as string, password: "" });
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("*").order("email"); if (error) throw error; return data as Profile[]; },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: async () => { const { data, error } = await supabase.from("groups").select("id, name").order("name"); if (error) throw error; return data as { id: string; name: string }[]; },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => { const { data, error } = await supabase.from("user_roles").select("*, groups(name)").order("created_at"); if (error) throw error; return data as UserRole[]; },
  });

  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });

  const addRoleMutation = useMutation({
    mutationFn: async (values: { user_id: string; group_id: string; role: string }) => {
      const { error } = await supabase.from("user_roles").insert(values as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] }); toast.success("Role assigned"); setDialogOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("user_roles").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] }); toast.success("Role removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      if (!createForm.email || !createForm.password) throw new Error("Email and password required");
      if (createForm.password.length < 6) throw new Error("Password must be at least 6 characters");
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: createForm.email, password: createForm.password, full_name: createForm.full_name || createForm.email, consultant_id: createForm.consultant_id || null, group_id: createForm.group_id || null, role: createForm.role || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("User created successfully");
      setCreateDialogOpen(false);
      setCreateForm({ email: "", password: "", full_name: "", consultant_id: "", group_id: "", role: "pmc_user" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editUserMutation = useMutation({
    mutationFn: async () => {
      if (!editingProfile) throw new Error("No user selected");
      const updates: Record<string, any> = {};
      if (editForm.full_name !== editingProfile.full_name) updates.full_name = editForm.full_name;
      if (editForm.consultant_id !== (editingProfile.consultant_id || "")) updates.consultant_id = editForm.consultant_id || null;
      if (editForm.status !== editingProfile.status) updates.status = editForm.status;
      if (editForm.email !== editingProfile.email) updates.email = editForm.email;
      if (editForm.password) updates.password = editForm.password;
      
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "update", user_id: editingProfile.user_id, updates },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("User updated");
      setEditDialogOpen(false);
      setEditingProfile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "delete", user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("User deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateUserMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "update", user_id: userId, updates: { status } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("User status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAssignRole = (p: Profile) => { setSelectedProfile(p); setRoleForm({ group_id: groups[0]?.id || "", role: "pmc_user" }); setDialogOpen(true); };
  const openEditUser = (p: Profile) => {
    setEditingProfile(p);
    setEditForm({ full_name: p.full_name || "", email: p.email, consultant_id: p.consultant_id || "", status: p.status, password: "" });
    setEditDialogOpen(true);
  };

  const filtered = profiles.filter((p) => p.email.toLowerCase().includes(search.toLowerCase()) || (p.full_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="bg-card rounded-md border mt-4">
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
          <span className="text-xs text-muted-foreground">{filtered.length} users</span>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}><UserPlus size={14} className="mr-1.5" />Create User</Button>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : (
            <table className="w-full text-sm"><thead><tr className="border-b">
              <th className="data-table-header text-left px-4 py-2.5">Email</th>
              <th className="data-table-header text-left px-4 py-2.5">Full Name</th>
              <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
              <th className="data-table-header text-center px-4 py-2.5">Status</th>
              <th className="data-table-header text-left px-4 py-2.5">Roles</th>
              <th className="data-table-header w-10"></th>
            </tr></thead>
            <tbody>{filtered.map((p) => {
              const roles = userRoles.filter((r) => r.user_id === p.user_id);
              return (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs">{p.email}</td>
                  <td className="px-4 py-2.5">{p.full_name || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {consultants.find(c => c.id === p.consultant_id)?.name || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {roles.map((r) => (
                        <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-accent-foreground text-xs">
                          {r.role} @ {r.groups?.name}
                          <button onClick={() => deleteRoleMutation.mutate(r.id)} className="hover:text-destructive"><Trash2 size={10} /></button>
                        </span>
                      ))}
                      {roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditUser(p)}><Pencil size={14} className="mr-2" />Edit Profile</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAssignRole(p)}><Plus size={14} className="mr-2" />Assign Role</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {p.status === "active" ? (
                          <DropdownMenuItem onClick={() => deactivateUserMutation.mutate({ userId: p.user_id, status: "inactive" })}><Ban size={14} className="mr-2" />Deactivate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => deactivateUserMutation.mutate({ userId: p.user_id, status: "active" })}><UserPlus size={14} className="mr-2" />Activate</DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}><UserX size={14} className="mr-2" />Delete User</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}</tbody></table>
          )}
        </div>
      </div>

      {/* Assign Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Role to {selectedProfile?.email}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!roleForm.group_id) { toast.error("Select a group"); return; } addRoleMutation.mutate({ user_id: selectedProfile!.user_id, group_id: roleForm.group_id, role: roleForm.role }); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Group</Label><Select value={roleForm.group_id} onValueChange={(v) => setRoleForm({ ...roleForm, group_id: v })}><SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger><SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Role</Label><Select value={roleForm.role} onValueChange={(v) => setRoleForm({ ...roleForm, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={addRoleMutation.isPending}>{addRoleMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Assign</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit User Profile</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editUserMutation.mutate(); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Consultant</Label>
              <Select value={editForm.consultant_id || "none"} onValueChange={(v) => setEditForm({ ...editForm, consultant_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>New Password (leave blank to keep)</Label><Input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Leave blank to keep current" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editUserMutation.isPending}>
                {editUserMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createUserMutation.mutate(); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="user@example.com" /></div>
            <div className="space-y-1.5"><Label>Temporary Password *</Label><Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Min 6 characters" /></div>
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} placeholder="John Doe" /></div>
            <div className="space-y-1.5"><Label>Consultant</Label>
              <Select value={createForm.consultant_id || "none"} onValueChange={(v) => setCreateForm({ ...createForm, consultant_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Group</Label>
              <Select value={createForm.group_id || "none"} onValueChange={(v) => setCreateForm({ ...createForm, group_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <UserPlus size={14} className="mr-1.5" />}Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.email}</strong>? This will remove all their roles, profile data, and authentication. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteUserMutation.mutate(deleteTarget.user_id)}>
              {deleteUserMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============== GROUPS TAB ===============
function GroupsTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState({ name: "", visibility_mode: "own_company_only" as string, consultant_id: null as string | null });
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["admin-groups-full"],
    queryFn: async () => { const { data, error } = await supabase.from("groups").select("*, consultants(name)").order("name"); if (error) throw error; return data as Group[]; },
  });

  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });

  const { data: permissions = [] } = useQuery({
    queryKey: ["admin-group-permissions", selectedGroup?.id],
    queryFn: async () => {
      if (!selectedGroup) return [];
      const { data, error } = await supabase.from("group_permissions").select("*").eq("group_id", selectedGroup.id);
      if (error) throw error;
      return data as GroupPermission[];
    },
    enabled: !!selectedGroup,
  });

  const upsertGroupMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload: any = { name: values.name, visibility_mode: values.visibility_mode, consultant_id: values.consultant_id || null };
      if (values.id) { const { error } = await supabase.from("groups").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("groups").insert(payload as any); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-groups-full"] }); queryClient.invalidateQueries({ queryKey: ["admin-groups"] }); toast.success(editing ? "Updated" : "Created"); setDialogOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("groups").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-groups-full"] }); queryClient.invalidateQueries({ queryKey: ["admin-groups"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertPermMutation = useMutation({
    mutationFn: async ({ group_id, module_name, permission }: { group_id: string; module_name: string; permission: string }) => {
      const existing = permissions.find((p) => p.module_name === module_name);
      if (existing) {
        const { error } = await supabase.from("group_permissions").update({ permission: permission as any }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("group_permissions").insert({ group_id, module_name, permission: permission as any } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-group-permissions"] }); toast.success("Permission updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm({ name: "", visibility_mode: "own_company_only", consultant_id: null }); setDialogOpen(true); };
  const openEdit = (g: Group) => { setEditing(g); setForm({ name: g.name, visibility_mode: g.visibility_mode, consultant_id: g.consultant_id }); setDialogOpen(true); };

  return (
    <>
      <div className="flex gap-4 mt-4">
        <div className="w-1/2 bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-sm font-medium">Groups</span>
            <Button size="sm" variant="outline" onClick={openCreate}><Plus size={14} className="mr-1" />Add Group</Button>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">Name</th>
                <th className="data-table-header text-left px-4 py-2.5">Visibility</th>
                <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{groups.map((g) => (
                <tr key={g.id} className={`border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer ${selectedGroup?.id === g.id ? "bg-accent" : ""}`} onClick={() => setSelectedGroup(g)}>
                  <td className="px-4 py-2.5 font-medium">{g.name}</td>
                  <td className="px-4 py-2.5 text-xs">{g.visibility_mode === "see_all_companies" ? "All Companies" : "Own Company"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{g.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <DropdownMenu><DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted" onClick={(e) => e.stopPropagation()}><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(g)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => deleteGroupMutation.mutate(g.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  </td>
                </tr>
              ))}</tbody></table>
            )}
          </div>
        </div>

        <div className="w-1/2 bg-card rounded-md border">
          <div className="px-4 py-3 border-b">
            <span className="text-sm font-medium">{selectedGroup ? `Permissions: ${selectedGroup.name}` : "Select a group"}</span>
          </div>
          {selectedGroup ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">Module</th>
                <th className="data-table-header text-left px-4 py-2.5">Permission</th>
              </tr></thead>
              <tbody>{MODULES.map((mod) => {
                const perm = permissions.find((p) => p.module_name === mod);
                return (
                  <tr key={mod} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium capitalize">{mod.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2">
                      <Select value={perm?.permission || "no_access"} onValueChange={(v) => upsertPermMutation.mutate({ group_id: selectedGroup.id, module_name: mod, permission: v })}>
                        <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{PERMISSIONS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}</tbody></table>
            </div>
          ) : <div className="text-center py-12 text-sm text-muted-foreground">Click a group to manage permissions</div>}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Group" : "Add Group"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) { toast.error("Name is required"); return; } upsertGroupMutation.mutate(editing ? { ...form, id: editing.id } : form); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Group Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Visibility</Label><Select value={form.visibility_mode} onValueChange={(v) => setForm({ ...form, visibility_mode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="own_company_only">Own Company Only</SelectItem><SelectItem value="see_all_companies">See All Companies</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Linked Consultant</Label><Select value={form.consultant_id || "none"} onValueChange={(v) => setForm({ ...form, consultant_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={upsertGroupMutation.isPending}>{upsertGroupMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============== LOOKUPS TAB ===============
function LookupsTab() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LookupValue | null>(null);
  const [form, setForm] = useState({ category: "", value: "", label: "", sort_order: 0, is_active: true });
  const queryClient = useQueryClient();

  const { data: allLookups = [], isLoading } = useQuery({
    queryKey: ["admin-lookups"],
    queryFn: async () => { const { data, error } = await supabase.from("lookup_values").select("*").order("category").order("sort_order"); if (error) throw error; return data as LookupValue[]; },
  });

  const categories = [...new Set(allLookups.map((l) => l.category))];
  const filtered = selectedCategory ? allLookups.filter((l) => l.category === selectedCategory) : allLookups;

  const upsertMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload: any = { category: values.category, value: values.value, label: values.label, sort_order: values.sort_order, is_active: values.is_active };
      if (values.id) { const { error } = await supabase.from("lookup_values").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("lookup_values").insert(payload as any); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-lookups"] }); queryClient.invalidateQueries({ queryKey: ["lookup_values"] }); toast.success(editing ? "Updated" : "Created"); setDialogOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("lookup_values").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-lookups"] }); queryClient.invalidateQueries({ queryKey: ["lookup_values"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm({ category: selectedCategory || "", value: "", label: "", sort_order: 0, is_active: true }); setDialogOpen(true); };
  const openEdit = (item: LookupValue) => { setEditing(item); setForm({ category: item.category, value: item.value, label: item.label, sort_order: item.sort_order, is_active: item.is_active }); setDialogOpen(true); };

  return (
    <>
      <div className="bg-card rounded-md border mt-4">
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <Select value={selectedCategory || "all"} onValueChange={(v) => setSelectedCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground flex-1">{filtered.length} values</span>
          <Button size="sm" variant="outline" onClick={openCreate}><Plus size={14} className="mr-1" />Add Value</Button>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : (
            <table className="w-full text-sm"><thead><tr className="border-b">
              <th className="data-table-header text-left px-4 py-2.5">Category</th>
              <th className="data-table-header text-left px-4 py-2.5">Value</th>
              <th className="data-table-header text-left px-4 py-2.5">Label</th>
              <th className="data-table-header text-center px-4 py-2.5">Order</th>
              <th className="data-table-header text-center px-4 py-2.5">Active</th>
              <th className="data-table-header w-10"></th>
            </tr></thead>
            <tbody>{filtered.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs">{item.category}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{item.value}</td>
                <td className="px-4 py-2.5">{item.label}</td>
                <td className="px-4 py-2.5 text-center font-mono">{item.sort_order}</td>
                <td className="px-4 py-2.5 text-center">{item.is_active ? <span className="text-success text-xs">✓</span> : <span className="text-muted-foreground text-xs">✗</span>}</td>
                <td className="px-4 py-2.5 text-center">
                  <DropdownMenu><DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(item)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                </td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Lookup Value" : "Add Lookup Value"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!form.category.trim() || !form.value.trim() || !form.label.trim()) { toast.error("All fields are required"); return; } upsertMutation.mutate(editing ? { ...form, id: editing.id } : form); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Category *</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. employee_status" /></div>
            <div className="space-y-1.5"><Label>Value *</Label><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="e.g. mobilized" /></div>
            <div className="space-y-1.5"><Label>Label *</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Mobilized" /></div>
            <div className="flex gap-4">
              <div className="space-y-1.5 flex-1"><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
              <div className="flex items-center gap-2 pt-5"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
