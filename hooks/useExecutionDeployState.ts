"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";

export type OrderLeg = "market" | "limit";

export type DeployState =
  | "idle"
  | "loading"
  | "market_activated"
  | "limit_watching"
  | "success";

export function orderDeployKey(symbol: string, leg: OrderLeg): string {
  return `${symbol}:${leg}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectEligibleKeys(orders: TokenExecutionPlan[]): string[] {
  const keys: string[] = [];
  for (const order of orders) {
    if (order.marketUsd > 0) {
      keys.push(orderDeployKey(order.symbol, "market"));
    }
    if (order.limitUsd > 0) {
      keys.push(orderDeployKey(order.symbol, "limit"));
    }
  }
  return keys;
}

function isTerminalState(state: DeployState): boolean {
  return (
    state === "success" ||
    state === "market_activated" ||
    state === "limit_watching"
  );
}

function allKeysComplete(
  keys: string[],
  states: Record<string, DeployState>,
): boolean {
  return keys.length > 0 && keys.every((key) => isTerminalState(states[key] ?? "idle"));
}

function legSuccessState(leg: OrderLeg): DeployState {
  return leg === "market" ? "market_activated" : "limit_watching";
}

interface UseExecutionDeployStateOptions {
  onDeployAll?: () => Promise<void>;
  onDeployLeg?: (
    symbol: string,
    leg: OrderLeg,
    plan: TokenExecutionPlan,
  ) => Promise<void>;
  onCancelLimit?: (symbol: string) => void;
}

export function useExecutionDeployState(
  orders: TokenExecutionPlan[],
  options?: UseExecutionDeployStateOptions,
) {
  const [legStates, setLegStates] = useState<Record<string, DeployState>>({});
  const [masterState, setMasterState] = useState<DeployState>("idle");
  const [deployError, setDeployError] = useState<string | null>(null);
  const legStatesRef = useRef(legStates);
  const deployRunRef = useRef(0);

  legStatesRef.current = legStates;

  const orderSignature = useMemo(
    () =>
      orders
        .map(
          (order) =>
            `${order.symbol}:${order.marketUsd}:${order.limitUsd}:${order.marketShare}:${order.limitShare}`,
        )
        .join("|"),
    [orders],
  );

  useEffect(() => {
    setLegStates({});
    setMasterState("idle");
    setDeployError(null);
    deployRunRef.current += 1;
  }, [orderSignature]);

  const eligibleKeys = useMemo(() => collectEligibleKeys(orders), [orders]);

  const planBySymbol = useMemo(
    () => new Map(orders.map((order) => [order.symbol, order])),
    [orders],
  );

  const getLegState = useCallback(
    (symbol: string, leg: OrderLeg): DeployState =>
      legStates[orderDeployKey(symbol, leg)] ?? "idle",
    [legStates],
  );

  const syncMasterState = useCallback(
    (nextLegStates: Record<string, DeployState>) => {
      if (allKeysComplete(eligibleKeys, nextLegStates)) {
        setMasterState("success");
      }
    },
    [eligibleKeys],
  );

  const deployLeg = useCallback(
    async (symbol: string, leg: OrderLeg) => {
      const key = orderDeployKey(symbol, leg);
      if (!eligibleKeys.includes(key)) return;

      const current = legStatesRef.current[key] ?? "idle";
      if (current === "loading" || isTerminalState(current)) return;

      const plan = planBySymbol.get(symbol);
      if (!plan) return;

      const runId = deployRunRef.current;
      setDeployError(null);
      setLegStates((prev) => ({ ...prev, [key]: "loading" }));

      try {
        if (options?.onDeployLeg) {
          await options.onDeployLeg(symbol, leg, plan);
        } else {
          await delay(750 + Math.random() * 350);
        }
        if (runId !== deployRunRef.current) return;

        const nextState = legSuccessState(leg);
        setLegStates((prev) => {
          const next = { ...prev, [key]: nextState };
          syncMasterState(next);
          return next;
        });
      } catch (error) {
        if (runId !== deployRunRef.current) return;
        setLegStates((prev) => ({ ...prev, [key]: "idle" }));
        setDeployError(
          error instanceof Error ? error.message : "Deploy leg failed",
        );
      }
    },
    [eligibleKeys, options, planBySymbol, syncMasterState],
  );

  const cancelLimit = useCallback(
    (symbol: string) => {
      const key = orderDeployKey(symbol, "limit");
      setLegStates((prev) => {
        if ((prev[key] ?? "idle") !== "limit_watching") return prev;
        const next = { ...prev, [key]: "idle" as const };
        return next;
      });
      options?.onCancelLimit?.(symbol);
    },
    [options],
  );

  const deployAll = useCallback(async () => {
    if (masterState === "loading" || masterState === "success") return;

    const pendingKeys = eligibleKeys.filter(
      (key) => !isTerminalState(legStatesRef.current[key] ?? "idle"),
    );
    if (pendingKeys.length === 0) {
      setMasterState("success");
      return;
    }

    const runId = deployRunRef.current;
    setDeployError(null);
    setMasterState("loading");
    setLegStates((prev) => {
      const next = { ...prev };
      for (const key of pendingKeys) {
        next[key] = "loading";
      }
      return next;
    });

    try {
      if (options?.onDeployAll) {
        await options.onDeployAll();
      }

      for (let index = 0; index < pendingKeys.length; index += 1) {
        await delay(420);
        if (runId !== deployRunRef.current) return;
        const key = pendingKeys[index];
        const leg: OrderLeg = key.endsWith(":limit") ? "limit" : "market";
        setLegStates((prev) => ({
          ...prev,
          [key]: legSuccessState(leg),
        }));
      }

      await delay(280);
      if (runId !== deployRunRef.current) return;
      setMasterState("success");
    } catch (error) {
      if (runId !== deployRunRef.current) return;
      setMasterState("idle");
      setLegStates({});
      setDeployError(
        error instanceof Error ? error.message : "Deploy All failed",
      );
    }
  }, [eligibleKeys, masterState, options]);

  return {
    masterState,
    deployError,
    getLegState,
    deployLeg,
    deployAll,
    cancelLimit,
    eligibleKeyCount: eligibleKeys.length,
  };
}
