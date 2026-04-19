const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    const body = await req.json();
    const { chatId, cyclePhase, smartSells, reEntry, warChest, cycleScore } = body;

    if (!chatId) {
      return new Response(
        JSON.stringify({ success: false, error: 'chatId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lines: string[] = [];

    // Cycle Phase Header
    if (cyclePhase) {
      const phaseEmojis: Record<string, string> = {
        bear_capitulation: '🟢', early_accumulation: '🔵',
        mid_bull: '🟡', late_bull: '🟠', distribution: '🔴',
      };
      lines.push(
        `⚡ <b>Cyklus trhu: ${phaseEmojis[cyclePhase.phase] || '⚪'} ${cyclePhase.label}</b>`,
        `📊 Cycle Score: <b>${cycleScore}/100</b> (spoľahlivosť ${cyclePhase.confidence}%)`,
        ''
      );
    }

    // Smart Sells
    if (smartSells && smartSells.length > 0) {
      lines.push('🎯 <b>Smart predajné signály:</b>', '');
      for (const sell of smartSells) {
        const urgencyEmoji = sell.urgency === 'critical' ? '🔴' :
          sell.urgency === 'high' ? '🟠' :
          sell.urgency === 'medium' ? '🟡' : '🟢';
        lines.push(
          `${urgencyEmoji} <b>${sell.symbol}</b> +${sell.profitPct.toFixed(1)}%`,
          `   → Predaj <b>${sell.adjustedSellPct}%</b>${sell.adjustedSellPct !== sell.baseSellPct ? ` (základ: ${sell.baseSellPct}%)` : ''}`,
          `   → ${sell.btcPct}% BTC / ${sell.stablePct}% Stable`,
          ''
        );
      }
    }

    // Re-Entry
    if (reEntry) {
      lines.push(
        '🟢 <b>Re-Entry Signál aktívny!</b>',
        `   ${reEntry.reason}`,
        ''
      );
      for (const c of (reEntry.conditions || [])) {
        lines.push(`   ✓ ${c}`);
      }
      lines.push('');
    }

    // War Chest
    if (warChest) {
      lines.push(`${warChest.label}`);
      if (warChest.actionLabel) {
        const prefix = warChest.recommendedMoveUsd > 0 ? '⚠️' : '✓';
        lines.push(`   ${prefix} <b>${warChest.actionLabel}</b>`);
      }
      if (typeof warChest.currentStableUsd === 'number' && typeof warChest.targetStableUsd === 'number' && warChest.stablePctTarget > 0) {
        lines.push(`   Stables: $${warChest.currentStableUsd.toFixed(0)} → cieľ $${warChest.targetStableUsd.toFixed(0)} (${warChest.stablePctTarget}%)`);
      }
      lines.push('');
    }

    if (lines.length === 0) {
      lines.push('ℹ️ Žiadne aktívne cyklové signály.');
    }

    const text = lines.join('\n');

    // Inline keyboard
    const inline_keyboard = [
      [
        { text: '✅ Vykonaj', callback_data: 'cycle_execute' },
        { text: '⏸️ Odlož', callback_data: 'cycle_postpone' },
        { text: '❌ Ignoruj', callback_data: 'cycle_ignore' },
      ],
    ];

    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(
      JSON.stringify({ success: true, message_id: data.result?.message_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending cycle alert:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
