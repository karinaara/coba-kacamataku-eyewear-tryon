import type { QualityReport } from '../core/quality'

const fmt = (v: number | undefined, digits = 2) => (v === undefined || Number.isNaN(v) ? '-' : v.toFixed(digits))

const ROWS: { key: string; label: string; digits?: number }[] = [
  { key: 'yaw', label: 'Yaw (deg)', digits: 1 },
  { key: 'pitch', label: 'Pitch (deg)', digits: 1 },
  { key: 'roll', label: 'Roll (deg)', digits: 1 },
  { key: 'faceHeight', label: 'Face height / frame' },
  { key: 'offsetX', label: 'Center offset x' },
  { key: 'offsetY', label: 'Center offset y' },
  { key: 'meanL', label: 'Cheek L*', digits: 1 },
  { key: 'clipped', label: 'Clipped fraction', digits: 3 },
  { key: 'crushed', label: 'Crushed fraction', digits: 3 },
  { key: 'deltaL', label: 'Left/right delta L*', digits: 1 },
  { key: 'skinRatio', label: 'Forehead skin ratio' },
  { key: 'ear', label: 'Eye aspect ratio' },
  { key: 'mouth', label: 'Mouth open ratio', digits: 3 },
  { key: 'edgeEnergy', label: 'Bridge edge energy', digits: 3 },
  { key: 'castChroma', label: 'Frame color cast', digits: 1 },
]

/** Raw gate numbers, so thresholds can be tuned against real photos. */
export function MetricsTable({ report }: { report: QualityReport }) {
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.key} className="border-t border-ground">
            <th scope="row" className="py-1 pr-2 font-normal text-muted">{r.label}</th>
            <td className="py-1 text-right font-semibold tabular-nums">{fmt(report.metrics[r.key], r.digits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
