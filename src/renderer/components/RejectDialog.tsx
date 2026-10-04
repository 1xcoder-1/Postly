import { useState } from 'react'
import { X } from 'lucide-react'
import { REJECTION_REASONS, type PostRecord, type RejectionReason } from '@shared/types'
import { Button } from '@/renderer/components/ui/button'
import { Textarea, Label, Select } from '@/renderer/components/ui/input'

const REASON_LABEL: Record<RejectionReason, string> = {
  'off-topic': 'Off-topic / not relevant',
  'wrong-fact': 'Wrong or unsupported fact',
  'too-long': 'Too long',
  'bad-tone': 'Wrong tone',
  clickbait: 'Clickbait / misleading',
  generic: 'Generic / bland',
  duplicate: 'Duplicate of an earlier post',
  other: 'Something else'
}

interface RejectDialogProps {
  post: PostRecord
  onCancel: () => void
  onConfirm: (reason: string, notes: string | null) => Promise<void> | void
}

/**
 * Asks why a post is rejected so the reason is stored as a negative example and
 * fed back into future prompts. The reason dropdown is required; the note is
 * optional context.
 */
export function RejectDialog({ post, onCancel, onConfirm }: RejectDialogProps) {
  const [reason, setReason] = useState<RejectionReason>('generic')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await onConfirm(reason, notes.trim() || null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl border bg-card p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Reject this post?</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{post.title}</p>

        <div className="space-y-3">
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as RejectionReason)}
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="notes">Note (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the AI should learn to avoid next time…"
              rows={3}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Reject & teach AI'}
          </Button>
        </div>
      </div>
    </div>
  )
}
