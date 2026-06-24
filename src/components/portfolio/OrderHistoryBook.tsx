import { History, Loader2, Receipt } from 'lucide-react';
import { formatPrice, formatUsd, TOKENS } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { Bento, Chip, Label } from '@/components/modern-portfolio/primitives';
import { useOrderHistory, type OrderHistoryEntry } from '@/hooks/useOrderHistory';

interface Props {
  lang: Lang;
  delay?: number;
}

function formatOrderDate(ts: string, lang: Lang): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'sk' ? 'sk-SK' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tokenColor(symbol: string): string {
  return TOKENS.find(t => t.symbol === symbol)?.color ?? '#94a3b8';
}

function OrderTypeChip({ type, sk }: { type: OrderHistoryEntry['orderType']; sk: boolean }) {
  const isLimit = type === 'limit';
  return (
    <Chip color={isLimit ? 'purple' : 'green'}>
      {isLimit ? (sk ? 'Limit' : 'Limit') : (sk ? 'Market' : 'Market')}
    </Chip>
  );
}

function OrderRow({ order, sk }: { order: OrderHistoryEntry; sk: boolean }) {
  const color = tokenColor(order.token);
  const amountLabel = order.token === 'BTC'
    ? order.amount.toFixed(6)
    : order.amount.toFixed(4);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-3 sm:p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0"
            style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
          >
            {order.token}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{order.token}</p>
            <p className="text-[10px] text-white/35 font-mono truncate">
              {formatOrderDate(order.timestamp, sk ? 'sk' : 'en')}
            </p>
          </div>
        </div>
        <OrderTypeChip type={order.orderType} sk={sk} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <Label>{sk ? 'Množstvo' : 'Amount'}</Label>
          <p className="font-mono text-sm font-semibold text-white mt-1 truncate">
            {amountLabel} {order.token}
          </p>
        </div>
        <div className="min-w-0">
          <Label>{sk ? 'Cena' : 'Price'}</Label>
          <p className="font-mono text-sm font-semibold text-white mt-1 truncate">
            {formatPrice(order.price)}
          </p>
        </div>
        <div className="min-w-0">
          <Label>USD</Label>
          <p className="font-mono text-sm font-semibold text-[#14F195] mt-1 truncate">
            {formatUsd(order.amountUsd)}
          </p>
        </div>
        <div className="min-w-0 col-span-2 sm:col-span-1">
          <Label>{sk ? 'Typ' : 'Type'}</Label>
          <p className="font-mono text-xs text-white/50 mt-1 capitalize">
            {order.orderType}
          </p>
        </div>
      </div>
    </div>
  );
}

export function OrderHistoryBook({ lang, delay = 0.48 }: Props) {
  const sk = lang === 'sk';
  const { orders, isLoading, usingLocalFallback } = useOrderHistory();

  return (
    <section className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-[#9945FF] shrink-0" />
          <Label className="!text-white/60">
            {sk ? 'História objednávok' : 'Order history'}
          </Label>
        </div>
        {orders.length > 0 && (
          <Chip color="default">{orders.length}</Chip>
        )}
      </div>

      <Bento delay={delay} className="p-4 sm:p-5 min-w-0">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-white/40 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {sk ? 'Načítavam históriu…' : 'Loading history…'}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white/25" />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-semibold text-white/70">
                {sk ? 'Zatiaľ žiadne objednávky' : 'No orders yet'}
              </p>
              <p className="text-xs text-white/35 leading-relaxed">
                {sk
                  ? 'Po vykonaní DCA market alebo limit objednávky sa tu zobrazí záznam s typom, tokenom, množstvom a cenou.'
                  : 'After you execute a DCA market or limit order, a record will appear here with type, token, amount, and price.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 min-w-0">
            {usingLocalFallback && (
              <p className="text-[10px] text-white/30 font-mono px-1">
                {sk ? 'Zobrazené z lokálnej histórie (offline záloha)' : 'Showing local history (offline fallback)'}
              </p>
            )}
            {orders.map(order => (
              <OrderRow key={order.id} order={order} sk={sk} />
            ))}
          </div>
        )}
      </Bento>
    </section>
  );
}
