import { NextResponse } from 'next/server';
import { getUserAndProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { profile } = await getUserAndProfile();
  if (!profile || profile.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, phone, role } = body as {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'manager' | 'owner';
  };
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone, role: role ?? 'manager' },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // The trigger handle_new_user inserts the profile row.
  // Update created_by so we know who added them.
  await admin
    .from('profiles')
    .update({ created_by: profile.id })
    .eq('id', data.user!.id);

  return NextResponse.json({ ok: true, id: data.user!.id });
}

export async function DELETE(req: Request) {
  const { profile } = await getUserAndProfile();
  if (!profile || profile.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (id === profile.id) {
    return NextResponse.json({ error: "Can't delete yourself" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

