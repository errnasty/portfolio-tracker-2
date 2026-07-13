'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useSpending } from '@/context/SpendingContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { History, Plus, Trash2, Wand2 } from 'lucide-react'

// Dynamic categorization rules. A rule maps a keyword (substring, case-
// insensitive) to a category and runs before the built-in keyword list, so the
// user can teach the app new merchants without code changes.
export function CategoryRulesCard() {
  const { categoryRules, categories, categoryById, addCategoryRule, deleteCategoryRule, applyRuleRetroactively } = useSpending()
  const [matchText, setMatchText] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const applyToExisting = async (ruleId: string, text: string, catId: string) => {
    setApplyingId(ruleId)
    try {
      const n = await applyRuleRetroactively(text, catId)
      toast.success(n > 0
        ? `Categorized ${n} past transaction${n === 1 ? '' : 's'}`
        : 'No uncategorized transactions match')
    } finally {
      setApplyingId(null)
    }
  }

  const add = async () => {
    if (!matchText.trim() || !categoryId) return
    setSaving(true)
    try {
      await addCategoryRule(matchText, categoryId)
      setMatchText('')
    } catch { /* toasted */ } finally { setSaving(false) }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="h-4 w-4" /> Category rules
        </CardTitle>
        <CardDescription>
          Teach the app: when a transaction contains a keyword, auto-assign a category.
          Your rules run before the built-in matches. Applied on import and manual add.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">If description contains…</label>
            <Input value={matchText} onChange={(e) => setMatchText(e.target.value)} placeholder="e.g. fomo pay" />
          </div>
          <div className="w-[140px] space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="icon" onClick={add} disabled={saving || !matchText.trim() || !categoryId}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {categoryRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom rules yet — built-in matching still applies.</p>
        ) : (
          <div className="divide-y divide-border">
            {categoryRules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs">&ldquo;{r.match_text}&rdquo;</span>
                  <span className="text-muted-foreground"> → {categoryById[r.category_id]?.name ?? 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Apply to existing uncategorized transactions"
                    disabled={applyingId === r.id}
                    onClick={() => applyToExisting(r.id, r.match_text, r.category_id)}
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-down"
                    onClick={() => deleteCategoryRule(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
