import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST: Confirm a draft dispatch via confirm_dispatch RPC
export async function POST(request, { params }) {
  try {
    const auth = await authenticateRequest({ allowedRoles: ['admin', 'dispatch'] });
    if (auth.error) return auth.error;
    const { supabase, employee } = auth;
    const { id } = params;

    const employeeId = employee.id;

    // Call Supabase RPC confirm_dispatch
    const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_dispatch', {
      p_dispatch_id: id,
      p_employee_id: employeeId,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    if (rpcResult && rpcResult.success === false) {
      return NextResponse.json(
        { error: rpcResult.error || 'Failed to confirm dispatch' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Dispatch confirmed successfully and stock deducted.',
        data: rpcResult,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('API /dispatch/[id]/confirm POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
