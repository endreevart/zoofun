import { defineStore } from "pinia";
import {
  defaultCustomRange,
  loadStoredPeriod,
  persistPeriod,
  type PeriodQuery,
  type RangeKey,
} from "@/lib/period";

export const usePeriodStore = defineStore("period", {
  state: () => loadStoredPeriod(),
  getters: {
    query(): PeriodQuery {
      if (this.range === "custom") {
        return { range: "custom", from: this.from, to: this.to };
      }
      return { range: this.range };
    },
    stamp(): string {
      return this.range === "custom" ? `custom:${this.from}:${this.to}` : this.range;
    },
  },
  actions: {
    setRange(range: RangeKey) {
      this.range = range;
      if (range === "custom") {
        const fallback = defaultCustomRange();
        if (!this.from) this.from = fallback.from;
        if (!this.to) this.to = fallback.to;
        if (this.from > this.to) {
          const swap = this.from;
          this.from = this.to;
          this.to = swap;
        }
      }
      persistPeriod({ range: this.range, from: this.from, to: this.to });
    },
    setCustomDates(from: string, to: string) {
      this.range = "custom";
      let start = from;
      let end = to;
      if (start && end && start > end) {
        const swap = start;
        start = end;
        end = swap;
      }
      this.from = start;
      this.to = end;
      persistPeriod({ range: this.range, from: this.from, to: this.to });
    },
  },
});
