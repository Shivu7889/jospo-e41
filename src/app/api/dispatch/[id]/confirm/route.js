import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// POST: Confirm a draft dispatch via confirm_dispatch RPC
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const supabase = await createServerSupabase();

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let employeeId = user?.id;

    // Optional employee_id in request body override if provided
    try {
      const body = await request.json();
      if (body?.employee_id) {
        employeeId = body.employee_id;
      }
    } catch (e) {
      // Body might be empty, ignore
    }

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Authentication required. No valid employee profile found.' },
        { status: 401 }
      );
    }

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
