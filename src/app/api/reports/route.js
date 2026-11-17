import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function extractThekedar(row) {
  if (row.contractor_name && typeof row.contractor_name === 'string' && row.contractor_name.trim()) {
    return row.contractor_name.trim();
  }
  if (row.remarks && typeof row.remarks === 'string') {
    const match = row.remarks.match(/\[(?:Thekedar|Contractor):\s*([^\]]+)\]/i) ||
                  row.remarks.match(/(?:Thekedar|Contractor):\s*([^\n,;]+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return 'General Assembly';
}

export async function GET(request) {
  try {
    const supabase = await createServerSupabase();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') || 'daily_production';
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1), 10);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

    // 1. Daily Production Report
    if (type === 'daily_production') {
      const { data, error } = await supabase
        .from('production_entries')
        .select(`
          id,
          quantity,
          production_date,
          remarks,
          created_at,
          cooler_models (
            id,
            name,
            code,
            qr_data
          ),
          employees (
            id,
            name
          )
        `)
        .eq('production_date', date)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const rows = (data || []).map((row) => ({
        id: row.id,
        production_date: row.production_date,
        model_code: row.cooler_models?.code || '—',
        model_name: row.cooler_models?.name || 'Cooler Model',
        quantity: row.quantity,
        employee_name: row.employees?.name || 'Staff',
        remarks: row.remarks || '',
        created_at: row.created_at,
      }));

      const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);

      return NextResponse.json({
        report_type: 'daily_production',
        date,
        total_quantity: totalQuantity,
        data: rows,
      });
    }

    // 2. Daily Dispatch Report
    if (type === 'daily_dispatch') {
      let { data, error } = await supabase
        .from('dispatches')
        .select(`
          id,
          vehicle_number,
          from_location,
          destination,
          dispatch_date,
          status,
          remarks,
          employees!dispatches_employee_id_fkey (
            id,
            name
          ),
          dispatch_items (
            id,
            quantity,
            cooler_models (
              id,
              name,
              code
            )
          )
        `)
        .eq('dispatch_date', date)
        .order('created_at', { ascending: false });

      if (error && (error.message?.includes('relationship') || error.code === 'PGRST200')) {
        const fallback = await supabase
          .from('dispatches')
          .select(`
            id,
            vehicle_number,
            from_location,
            destination,
            dispatch_date,
            status,
            remarks,
            dispatch_items (
              id,
              quantity,
              cooler_models (
                id,
                name,
                code
              )
            )
          `)
          .eq('dispatch_date', date)
          .order('created_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Flatten dispatch items for tabular display
      const rows = [];
      let totalQuantity = 0;

      (data || []).forEach((d) => {
        if (!d.dispatch_items || d.dispatch_items.length === 0) {
          rows.push({
            dispatch_id: d.id,
            vehicle_number: d.vehicle_number,
            from_location: d.from_location,
            destination: d.destination,
            dispatch_date: d.dispatch_date,
            model_code: '—',
            model_name: 'No items',
            quantity: 0,
            status: d.status,
            employee_name: d.employees?.name || 'Staff',
            remarks: d.remarks || '',
          });
        } else {
          d.dispatch_items.forEach((item) => {
            rows.push({
              dispatch_id: d.id,
              vehicle_number: d.vehicle_number,
              from_location: d.from_location,
              destination: d.destination,
              dispatch_date: d.dispatch_date,
              model_code: item.cooler_models?.code || '—',
              model_name: item.cooler_models?.name || 'Cooler Model',
              quantity: item.quantity,
              status: d.status,
              employee_name: d.employees?.name || 'Staff',
              remarks: d.remarks || '',
            });
            if (d.status === 'confirmed') {
              totalQuantity += item.quantity;
            }
          });
        }
      });

      return NextResponse.json({
        report_type: 'daily_dispatch',
        date,
        total_confirmed_quantity: totalQuantity,
        data: rows,
      });
    }

    // 3. Monthly Summary (Production vs Dispatch by Day)
    if (type === 'monthly_summary') {
      const pad = (n) => String(n).padStart(2, '0');
      const startDate = `${year}-${pad(month)}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const endDate = `${year}-${pad(month)}-${pad(daysInMonth)}`;

      // Fetch production for the month
      const { data: prodData, error: prodErr } = await supabase
        .from('production_entries')
        .select('production_date, quantity')
        .gte('production_date', startDate)
        .lte('production_date', endDate);

      if (prodErr) {
        return NextResponse.json({ error: prodErr.message }, { status: 400 });
      }

      // Fetch confirmed dispatches for the month
      const { data: dispData, error: dispErr } = await supabase
        .from('dispatches')
        .select(`
          dispatch_date,
          status,
          dispatch_items (
            quantity
          )
        `)
        .eq('status', 'confirmed')
        .gte('dispatch_date', startDate)
        .lte('dispatch_date', endDate);

      if (dispErr) {
        return NextResponse.json({ error: dispErr.message }, { status: 400 });
      }

      // Aggregate day by day
      const dailyMap = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${pad(month)}-${pad(day)}`;
        dailyMap[dStr] = {
          date: dStr,
          day,
          production: 0,
          dispatch: 0,
          net_change: 0,
        };
      }

      (prodData || []).forEach((p) => {
        if (dailyMap[p.production_date]) {
          dailyMap[p.production_date].production += p.quantity;
        }
      });

      (dispData || []).forEach((d) => {
        const totalDisp = (d.dispatch_items || []).reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        );
        if (dailyMap[d.dispatch_date]) {
          dailyMap[d.dispatch_date].dispatch += totalDisp;
        }
      });

      let totalMonthlyProduction = 0;
      let totalMonthlyDispatch = 0;

      const dailySummary = Object.values(dailyMap).map((entry) => {
        const net = entry.production - entry.dispatch;
        totalMonthlyProduction += entry.production;
        totalMonthlyDispatch += entry.dispatch;
        return {
          ...entry,
          net_change: net,
        };
      });

      return NextResponse.json({
        report_type: 'monthly_summary',
        month,
        year,
        start_date: startDate,
        end_date: endDate,
        totals: {
          production: totalMonthlyProduction,
          dispatch: totalMonthlyDispatch,
          net_change: totalMonthlyProduction - totalMonthlyDispatch,
        },
        data: dailySummary,
      });
    }

    // 4. Model-wise Stock Report
    if (type === 'model_stock') {
      // 1. Current stock per model
      const { data: currentStock, error: stockErr } = await supabase
        .from('current_stock')
        .select('*');

      if (stockErr) {
        return NextResponse.json({ error: stockErr.message }, { status: 400 });
      }

      // 2. All-time stock transactions for cumulative production & dispatch stats
      const { data: txs, error: txErr } = await supabase
        .from('stock_transactions')
        .select('model_id, transaction_type, quantity');

      if (txErr) {
        return NextResponse.json({ error: txErr.message }, { status: 400 });
      }

      const txStats = {};
      (txs || []).forEach((tx) => {
        if (!txStats[tx.model_id]) {
          txStats[tx.model_id] = {
            total_production: 0,
            total_dispatch: 0,
            total_adjustments: 0,
          };
        }
        if (tx.transaction_type === 'production') {
          txStats[tx.model_id].total_production += tx.quantity;
        } else if (tx.transaction_type === 'dispatch') {
          txStats[tx.model_id].total_dispatch += Math.abs(tx.quantity);
        } else if (tx.transaction_type === 'adjustment') {
          txStats[tx.model_id].total_adjustments += tx.quantity;
        }
      });

      const modelStockList = (currentStock || []).map((m) => {
        const stats = txStats[m.model_id] || {
          total_production: 0,
          total_dispatch: 0,
          total_adjustments: 0,
        };
        return {
          model_id: m.model_id,
          model_code: m.model_code,
          model_name: m.model_name,
          current_stock: m.current_stock,
          total_production_all_time: stats.total_production,
          total_dispatch_all_time: stats.total_dispatch,
          net_adjustments_all_time: stats.total_adjustments,
        };
      });

      return NextResponse.json({
        report_type: 'model_stock',
        generated_at: new Date().toISOString(),
        data: modelStockList,
      });
    }

    // 5. Thekedar / Contractor Production Report
    if (type === 'thekedar_production' || type === 'contractor_production') {
      const todayStr = new Date().toISOString().split('T')[0];
      const pad = (n) => String(n).padStart(2, '0');
      const defaultStartDate = `${year}-${pad(month)}-01`;

      const startDate = searchParams.get('start_date') || defaultStartDate;
      const endDate = searchParams.get('end_date') || todayStr;
      const selectedThekedar = searchParams.get('thekedar') || searchParams.get('contractor_name') || 'all';
      const selectedModelId = searchParams.get('model_id') || 'all';

      const selectQuery = `
        id,
        quantity,
        production_date,
        remarks,
        created_at,
        model_id,
        employee_id,
        cooler_models (
          id,
          name,
          code
        ),
        employees (
          id,
          name
        )
      `;

      let query = supabase
        .from('production_entries')
        .select(`contractor_name, ${selectQuery}`)
        .gte('production_date', startDate)
        .lte('production_date', endDate)
        .order('production_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (selectedModelId !== 'all') {
        query = query.eq('model_id', selectedModelId);
      }

      let { data, error } = await query;

      // Fallback if contractor_name column doesn't exist yet
      if (error && (error.message?.includes('contractor_name') || error.code === 'PGRST204')) {
        let fallbackQuery = supabase
          .from('production_entries')
          .select(selectQuery)
          .gte('production_date', startDate)
          .lte('production_date', endDate)
          .order('production_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (selectedModelId !== 'all') {
          fallbackQuery = fallbackQuery.eq('model_id', selectedModelId);
        }

        const fallbackResult = await fallbackQuery;
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const allThekedarsSet = new Set();
      const allRows = (data || []).map((row, index) => {
        const thekedar = extractThekedar(row);
        if (thekedar) allThekedarsSet.add(thekedar);

        const cleanRemarks = (row.remarks || '')
          .replace(/\[(?:Thekedar|Contractor):\s*[^\]]+\]/gi, '')
          .trim();

        return {
          id: row.id,
          serial_no: index + 1,
          production_date: row.production_date,
          thekedar_name: thekedar,
          contractor_name: thekedar,
          model_id: row.model_id,
          model_code: row.cooler_models?.code || '—',
          model_name: row.cooler_models?.name || 'Cooler Model',
          quantity: row.quantity,
          employee_name: row.employees?.name || 'Staff',
          remarks: cleanRemarks,
          created_at: row.created_at,
        };
      });

      // Filter by thekedar if requested
      const filteredRows = selectedThekedar === 'all'
        ? allRows
        : allRows.filter((r) => r.thekedar_name.toLowerCase() === selectedThekedar.toLowerCase());

      const totalQuantity = filteredRows.reduce((sum, r) => sum + r.quantity, 0);

      // Group by Thekedar summary
      const byThekedar = {};
      filteredRows.forEach((r) => {
        const thekedarName = r.thekedar_name || r.contractor_name || 'General / Unassigned';
        if (!byThekedar[thekedarName]) {
          byThekedar[thekedarName] = {
            thekedar_name: thekedarName,
            contractor_name: thekedarName,
            total_quantity: 0,
            entry_count: 0,
            models: {},
          };
        }
        byThekedar[thekedarName].total_quantity += r.quantity;
        byThekedar[thekedarName].entry_count += 1;

        const mCode = r.model_code || 'Model';
        if (!byThekedar[thekedarName].models[mCode]) {
          byThekedar[thekedarName].models[mCode] = {
            code: mCode,
            name: r.model_name || mCode,
            quantity: 0,
          };
        }
        byThekedar[thekedarName].models[mCode].quantity += r.quantity;
      });

      // Group by Model summary
      const byModel = {};
      filteredRows.forEach((r) => {
        if (!byModel[r.model_code]) {
          byModel[r.model_code] = {
            model_code: r.model_code,
            model_name: r.model_name,
            total_quantity: 0,
            entry_count: 0,
          };
        }
        byModel[r.model_code].total_quantity += r.quantity;
        byModel[r.model_code].entry_count += 1;
      });

      return NextResponse.json({
        report_type: 'thekedar_production',
        start_date: startDate,
        end_date: endDate,
        selected_thekedar: selectedThekedar,
        total_quantity: totalQuantity,
        total_entries: filteredRows.length,
        thekedar_count: Object.keys(byThekedar).length,
        thekedar_list: Array.from(allThekedarsSet).sort(),
        by_thekedar: Object.values(byThekedar).sort((a, b) => b.total_quantity - a.total_quantity),
        by_model: Object.values(byModel).sort((a, b) => b.total_quantity - a.total_quantity),
        data: filteredRows,
      });
    }

    return NextResponse.json(
      { error: `Unknown report type: ${type}` },
      { status: 400 }
    );
  } catch (err) {
    console.error('API /reports GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
