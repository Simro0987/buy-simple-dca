import { useEffect, useState } from 'react';
import { Lock, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { hashPin, isValidPinFormat, markUnlocked } from '@/lib/pin';
import { Skeleton } from '@/components/ui/skeleton';

interface PinLockProps {
  onUnlock: () => void;
}

type Mode = 'enter' | 'set' | 'confirm';

export function PinLock({ onUnlock }: PinLockProps) {
  const { data: settings, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();

  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const hasPin = !!settings?.pin_hash;
  const mode: Mode = !hasPin ? (firstPin ? 'confirm' : 'set') : 'enter';

  useEffect(() => {
    setError(null);
  }, [pin]);

  const press = (d: string) => {
    if (pin.length >= 4) return;
    setPin((p) => p + d);
  };
  const back = () => setPin((p) => p.slice(0, -1));
  const reset = () => {
    setPin('');
    setError(null);
  };

  useEffect(() => {
    if (pin.length !== 4 || !settings) return;
    (async () => {
      const h = await hashPin(pin);
      if (mode === 'enter') {
        if (h === settings.pin_hash) {
          markUnlocked();
          onUnlock();
        } else {
          setError('Wrong PIN');
          setAttempts((a) => a + 1);
          setTimeout(reset, 400);
        }
      } else if (mode === 'set') {
        setFirstPin(pin);
        setPin('');
      } else if (mode === 'confirm') {
        if (pin === firstPin) {
          await update.mutateAsync({ id: settings.id, pin_hash: h });
          markUnlocked();
          onUnlock();
        } else {
          setError("PINs don't match");
          setFirstPin('');
          setTimeout(reset, 400);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Skeleton className="h-72 w-72" />
      </div>
    );
  }

  const title =
    mode === 'enter' ? 'Enter PIN' : mode === 'set' ? 'Create 4-digit PIN' : 'Confirm PIN';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-xs flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">Buy Simple DCA</p>
        </div>

        <div className="flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                pin.length > i ? 'bg-primary border-primary' : 'border-border'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-xs text-destructive h-4">{error}</p>}
        {!error && <div className="h-4" />}

        <div className="grid grid-cols-3 gap-3 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Button
              key={d}
              variant="ghost"
              className="h-14 text-xl font-light rounded-2xl bg-card hover:bg-accent"
              onClick={() => press(d)}
            >
              {d}
            </Button>
          ))}
          <div />
          <Button
            variant="ghost"
            className="h-14 text-xl font-light rounded-2xl bg-card hover:bg-accent"
            onClick={() => press('0')}
          >
            0
          </Button>
          <Button
            variant="ghost"
            className="h-14 rounded-2xl hover:bg-accent"
            onClick={back}
            aria-label="Backspace"
          >
            <Delete className="w-5 h-5" />
          </Button>
        </div>

        {attempts >= 3 && mode === 'enter' && (
          <p className="text-[11px] text-muted-foreground text-center">
            Multiple wrong attempts. This is a personal-use app — reset PIN from Settings on a
            trusted device.
          </p>
        )}
      </div>
    </div>
  );
}
