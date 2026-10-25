import { summarizeReport, type CheckStatus, type QualityReport } from '../core/quality'

function StatusIcon({ status }: { status: CheckStatus }) {
  const common = { viewBox: '0 0 24 24', className: 'size-5 shrink-0', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, 'aria-hidden': true } as const
  if (status === 'pass')
    return (
      <svg {...common} className="size-5 shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.8 2.8L16 9.5" />
      </svg>
    )
  return (
    <svg {...common} className="size-5 shrink-0 text-warn">
      <path d="M12 3.5 22 20.5H2L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </svg>
  )
}

const STATUS_WORD: Record<CheckStatus, string> = { pass: 'Good', fail: 'Needs attention', warn: 'Heads up' }

/** The four live checklist rows from screen 2, plus any warn-only extras. Not color-only: icon + text. */
export function Checklist({ report, waiting }: { report: QualityReport | null; waiting?: string }) {
  if (!report) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm text-muted" role="status">
        {waiting ?? 'Looking for your face...'}
      </p>
    )
  }
  const { groups, extras } = summarizeReport(report)
  return (
    <ul className="flex flex-col gap-2 rounded-3xl bg-white p-4" aria-live="polite">
      {groups.map((g) => (
        <li key={g.group} className="flex items-start gap-3 text-sm">
          <StatusIcon status={g.status} />
          <div>
            <p className="font-semibold">
              {g.label}
              <span className="sr-only"> - {STATUS_WORD[g.status]}</span>
            </p>
            {g.tip && <p className="text-muted">{g.tip}</p>}
          </div>
        </li>
      ))}
      {extras.map((e) => (
        <li key={e.id} className="flex items-start gap-3 text-sm">
          <StatusIcon status="warn" />
          <p className="text-muted">
            <span className="sr-only">Heads up: </span>
            {e.tip}
          </p>
        </li>
      ))}
    </ul>
  )
}
