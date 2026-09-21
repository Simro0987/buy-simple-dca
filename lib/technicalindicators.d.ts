declare module "technicalindicators" {
  export class SMA {
    static calculate(input: { period: number; values: number[] }): number[];
  }
  export class EMA {
    static calculate(input: { period: number; values: number[] }): number[];
  }
  export class RSI {
    static calculate(input: { period: number; values: number[] }): number[];
  }
  export class ATR {
    static calculate(input: {
      period: number;
      high: number[];
      low: number[];
      close: number[];
    }): number[];
  }
}
