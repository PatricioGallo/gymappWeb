import { BarChart, LineChart } from "react-native-chart-kit";
import { StyleSheet } from "react-native";

import type { WeightLogEntry } from "@/lib/profileService";
import { formatFechaCorta } from "@/lib/dias";
import { colors } from "@/theme/colors";

const baseChartConfig = {
  backgroundGradientFrom: colors.surface,
  backgroundGradientTo: colors.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 138, 61, ${opacity})`,
  labelColor: () => colors.textMuted,
  propsForBackgroundLines: { stroke: colors.border },
  barPercentage: 0.6,
};

export function FrequencyChart({ buckets, width }: { buckets: { label: string; count: number }[]; width: number }) {
  return (
    <BarChart
      data={{ labels: buckets.map((b) => b.label), datasets: [{ data: buckets.map((b) => b.count) }] }}
      width={width}
      height={180}
      fromZero
      yAxisLabel=""
      yAxisSuffix=""
      withInnerLines
      chartConfig={baseChartConfig}
      style={styles.chart}
    />
  );
}

export function ProgressChart({ entries, width }: { entries: WeightLogEntry[]; width: number }) {
  return (
    <LineChart
      data={{
        labels: entries.map((e) => formatFechaCorta(e.fecha)),
        datasets: [{ data: entries.map((e) => e.peso) }],
      }}
      width={width}
      height={180}
      withInnerLines
      bezier
      chartConfig={{
        ...baseChartConfig,
        propsForDots: { r: "3", strokeWidth: "2", stroke: colors.accent2 },
      }}
      style={styles.chart}
    />
  );
}

const styles = StyleSheet.create({
  chart: { borderRadius: 12, marginTop: 8 },
});
