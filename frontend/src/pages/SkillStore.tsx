import { useState, useEffect } from 'react'
import { listSkills } from '../lib/api'
import type { Skill } from '../lib/api'
import { Zap, Loader2 } from 'lucide-react'

export default function SkillStore() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch(() => setSkills([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text">技能商店</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">浏览和安装 AI 技能扩展</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-accent-blue" />
        </div>
      ) : skills.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-dark-text-secondary">
          暂无已安装技能
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {skills.map(skill => (
            <div key={skill.name} className="rounded-xl border border-dark-border bg-dark-card p-5 hover:border-accent-blue/30 transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-yellow/10">
                <Zap size={20} className="text-accent-yellow" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-dark-text">{skill.name}</h3>
              <p className="mt-1 text-xs text-dark-text-secondary leading-relaxed">{skill.description}</p>
              {skill.source && (
                <div className="mt-3 text-xs text-dark-text-secondary">
                  来源: {skill.source}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
