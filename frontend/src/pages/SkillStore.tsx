import { useState, useEffect } from 'react'
import {
  listSkills, searchSkills, installSkill, toggleSkill,
  listCuratedSkills, installCuratedSkill, submitSkill, mySubmissions,
} from '../lib/api'
import type { Skill, SkillSearchResult, CuratedSkill, SkillSubmission } from '../lib/api'
import {
  Zap, Loader2, Search, Download, ExternalLink, Check,
  AlertTriangle, Star, Send,
} from 'lucide-react'

type Tab = 'curated' | 'search' | 'installed'

export default function SkillStore() {
  const [tab, setTab] = useState<Tab>('curated')

  // Installed skills
  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(true)

  // Curated skills
  const [curated, setCurated] = useState<CuratedSkill[]>([])
  const [loadingCurated, setLoadingCurated] = useState(true)
  const [installingCurated, setInstallingCurated] = useState<string | null>(null)

  // Search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SkillSearchResult[]>([])
  const [searched, setSearched] = useState(false)

  // Install state (marketplace)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [installError, setInstallError] = useState('')

  // Toggle state
  const [toggling, setToggling] = useState<string | null>(null)

  // Submit skill state
  const [showSubmit, setShowSubmit] = useState(false)
  const [submitName, setSubmitName] = useState('')
  const [submitDesc, setSubmitDesc] = useState('')
  const [submitUrl, setSubmitUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submissions, setSubmissions] = useState<SkillSubmission[]>([])

  const refreshSkills = () => {
    listSkills().then(setSkills).catch(() => setSkills([]))
  }

  const refreshCurated = () => {
    listCuratedSkills().then(setCurated).catch(() => setCurated([])).finally(() => setLoadingCurated(false))
  }

  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch(() => setSkills([]))
      .finally(() => setLoadingSkills(false))
    refreshCurated()
  }, [])

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim() || searching) return
    setSearching(true)
    setSearched(true)
    setInstallError('')
    try {
      const data = await searchSkills(query.trim(), 10)
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleInstall = async (slug: string) => {
    if (installing) return
    setInstalling(slug)
    setInstallError('')
    try {
      await installSkill(slug)
      setInstalled(prev => new Set(prev).add(slug))
      refreshSkills()
    } catch (err: any) {
      setInstallError(err?.message || '安装失败')
    } finally {
      setInstalling(null)
    }
  }

  const handleInstallCurated = async (skillId: string) => {
    if (installingCurated) return
    setInstallingCurated(skillId)
    setInstallError('')
    try {
      await installCuratedSkill(skillId)
      setCurated(prev => prev.map(s => s.id === skillId ? { ...s, installed: true, install_count: s.install_count + 1 } : s))
      refreshSkills()
    } catch (err: any) {
      setInstallError(err?.message || '安装失败')
    } finally {
      setInstallingCurated(null)
    }
  }

  const handleToggle = async (skill: Skill) => {
    if (toggling) return
    const newEnabled = skill.disabled !== false
    setToggling(skill.name)
    try {
      await toggleSkill(skill.name, newEnabled)
      setSkills(prev =>
        prev.map(s =>
          s.name === skill.name ? { ...s, disabled: !newEnabled } : s
        )
      )
    } catch {
      refreshSkills()
    } finally {
      setToggling(null)
    }
  }

  const handleSubmitSkill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submitName.trim() || submitting) return
    setSubmitting(true)
    try {
      await submitSkill({
        skill_name: submitName.trim(),
        description: submitDesc.trim(),
        source_url: submitUrl.trim() || undefined,
      })
      setSubmitName('')
      setSubmitDesc('')
      setSubmitUrl('')
      setShowSubmit(false)
      mySubmissions().then(setSubmissions).catch(() => {})
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (tab === 'curated') {
      mySubmissions().then(setSubmissions).catch(() => {})
    }
  }, [tab])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'curated', label: '精选推荐' },
    { key: 'search', label: '商店搜索' },
    { key: 'installed', label: '已安装' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text">技能商店</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">
          发现、安装和管理 AI 技能扩展
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-dark-card p-1 border border-dark-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-accent-blue text-white'
                : 'text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg'
            }`}
          >
            {t.label}
            {t.key === 'installed' && skills.length > 0 && (
              <span className="ml-1.5 text-xs opacity-70">({skills.length})</span>
            )}
          </button>
        ))}
      </div>

      {installError && (
        <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red">
          {installError}
        </div>
      )}

      {/* ===== Curated Tab ===== */}
      {tab === 'curated' && (
        <div>
          {loadingCurated ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-accent-blue" />
            </div>
          ) : curated.length === 0 ? (
            <div className="rounded-xl border border-dark-border bg-dark-card p-8 text-center text-sm text-dark-text-secondary">
              暂无精选技能
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {curated.map(skill => {
                const isInstalling = installingCurated === skill.id
                return (
                  <div
                    key={skill.id}
                    className="rounded-xl border border-dark-border bg-dark-card p-5 hover:border-accent-blue/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue/10">
                        {skill.is_featured ? (
                          <Star size={20} className="text-accent-yellow" />
                        ) : (
                          <Zap size={20} className="text-accent-blue" />
                        )}
                      </div>
                      {skill.is_featured && (
                        <span className="rounded bg-accent-yellow/10 px-2 py-0.5 text-xs text-accent-yellow">推荐</span>
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-dark-text">{skill.name}</h3>
                    <p className="mt-1 text-xs text-dark-text-secondary leading-relaxed line-clamp-2">{skill.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-dark-text-secondary">
                        {skill.author && <span>{skill.author}</span>}
                        <span className="rounded bg-dark-bg px-1.5 py-0.5">{skill.category}</span>
                        <span>{skill.install_count} 次安装</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleInstallCurated(skill.id)}
                      disabled={isInstalling || skill.installed}
                      className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                        skill.installed
                          ? 'bg-accent-green/10 text-accent-green'
                          : 'bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50'
                      }`}
                    >
                      {isInstalling ? (
                        <><Loader2 size={13} className="animate-spin" /> 安装中...</>
                      ) : skill.installed ? (
                        <><Check size={13} /> 已安装</>
                      ) : (
                        <><Download size={13} /> 安装</>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Submit skill section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-dark-text">提交技能</h2>
              <button
                onClick={() => setShowSubmit(!showSubmit)}
                className="flex items-center gap-1.5 text-sm text-accent-blue hover:text-accent-blue/80"
              >
                <Send size={14} />
                {showSubmit ? '收起' : '推荐技能'}
              </button>
            </div>

            {showSubmit && (
              <form onSubmit={handleSubmitSkill} className="rounded-xl border border-dark-border bg-dark-card p-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-dark-text-secondary mb-1">技能名称 *</label>
                  <input
                    type="text"
                    value={submitName}
                    onChange={e => setSubmitName(e.target.value)}
                    placeholder="例如: web-scraper"
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-text-secondary mb-1">描述</label>
                  <textarea
                    value={submitDesc}
                    onChange={e => setSubmitDesc(e.target.value)}
                    placeholder="简要描述技能功能"
                    rows={2}
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-text-secondary mb-1">来源链接（可选）</label>
                  <input
                    type="text"
                    value={submitUrl}
                    onChange={e => setSubmitUrl(e.target.value)}
                    placeholder="marketplace slug 或 git URL"
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-sm text-dark-text outline-none focus:border-accent-blue"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!submitName.trim() || submitting}
                  className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  提交审核
                </button>
              </form>
            )}

            {/* My submissions */}
            {submissions.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-medium text-dark-text-secondary">我的提交</h3>
                {submissions.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-dark-border bg-dark-card px-4 py-2.5">
                    <div>
                      <span className="text-sm text-dark-text">{s.skill_name}</span>
                      {s.description && <span className="ml-2 text-xs text-dark-text-secondary">{s.description}</span>}
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      s.status === 'approved' ? 'bg-accent-green/10 text-accent-green' :
                      s.status === 'rejected' ? 'bg-accent-red/10 text-accent-red' :
                      'bg-accent-yellow/10 text-accent-yellow'
                    }`}>
                      {s.status === 'approved' ? '已通过' : s.status === 'rejected' ? '已拒绝' : '审核中'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Search Tab ===== */}
      {tab === 'search' && (
        <div>
          <form onSubmit={handleSearch} className="mb-6 flex gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-dark-border bg-dark-card px-4 py-2.5">
              <Search size={16} className="text-dark-text-secondary" />
              <input
                type="text"
                placeholder="搜索技能，例如：web scraping, react, testing..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-dark-text outline-none placeholder:text-dark-text-secondary"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              搜索
            </button>
          </form>

          <p className="mb-4 text-xs text-dark-text-secondary">
            搜索来自 <a href="https://skills.sh/" target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">skills.sh</a> 的技能
          </p>

          {searched && (
            <div>
              <h2 className="mb-3 text-base font-semibold text-dark-text">
                搜索结果
                {results.length > 0 && <span className="ml-2 text-sm font-normal text-dark-text-secondary">({results.length} 个技能)</span>}
              </h2>
              {searching ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-accent-blue" />
                  <span className="ml-3 text-sm text-dark-text-secondary">正在搜索...</span>
                </div>
              ) : results.length === 0 ? (
                <div className="rounded-xl border border-dark-border bg-dark-card p-8 text-center text-sm text-dark-text-secondary">
                  未找到相关技能，请尝试其他关键词
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map(r => {
                    const isInstalled = installed.has(r.slug)
                    const isInstalling = installing === r.slug
                    return (
                      <div key={r.slug} className="flex items-center justify-between rounded-xl border border-dark-border bg-dark-card px-5 py-3.5 hover:border-accent-blue/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-dark-text truncate">{r.slug}</span>
                            <span className="shrink-0 rounded bg-dark-bg px-2 py-0.5 text-xs text-dark-text-secondary">{r.installs}</span>
                          </div>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex items-center gap-1 text-xs text-accent-blue/70 hover:text-accent-blue truncate"
                          >
                            <ExternalLink size={11} />
                            {r.url}
                          </a>
                        </div>
                        <button
                          onClick={() => handleInstall(r.slug)}
                          disabled={isInstalling || isInstalled}
                          className={`ml-4 flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                            isInstalled
                              ? 'bg-accent-green/10 text-accent-green'
                              : 'bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50'
                          }`}
                        >
                          {isInstalling ? (
                            <><Loader2 size={13} className="animate-spin" /> 安装中...</>
                          ) : isInstalled ? (
                            <><Check size={13} /> 已安装</>
                          ) : (
                            <><Download size={13} /> 安装</>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Installed Tab ===== */}
      {tab === 'installed' && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-dark-text">
            已安装技能
            {skills.length > 0 && <span className="ml-2 text-sm font-normal text-dark-text-secondary">({skills.filter(s => s.compatible !== false).length} 可用 / {skills.length} 总计)</span>}
          </h2>
          {loadingSkills ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-accent-blue" />
            </div>
          ) : skills.length === 0 ? (
            <div className="rounded-xl border border-dark-border bg-dark-card p-8 text-center text-sm text-dark-text-secondary">
              暂无已安装技能，前往"精选推荐"或"商店搜索"安装
            </div>
          ) : (
            <>
              {/* Compatible skills */}
              <div className="grid grid-cols-3 gap-4">
                {skills.filter(s => s.compatible !== false).map(skill => {
                  const isDisabled = skill.disabled === true
                  const isToggling = toggling === skill.name
                  return (
                    <div
                      key={skill.name}
                      className={`rounded-xl border bg-dark-card p-5 transition-colors ${
                        isDisabled
                          ? 'border-dark-border/50 opacity-60'
                          : 'border-dark-border hover:border-accent-blue/30'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-yellow/10">
                          <Zap size={20} className={isDisabled ? 'text-dark-text-secondary' : 'text-accent-yellow'} />
                        </div>
                        <button
                          onClick={() => handleToggle(skill)}
                          disabled={isToggling}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            isDisabled ? 'bg-dark-border' : 'bg-accent-green'
                          } ${isToggling ? 'opacity-50' : 'cursor-pointer'}`}
                          title={isDisabled ? '点击启用' : '点击禁用'}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                              isDisabled ? 'translate-x-0.5' : 'translate-x-[18px]'
                            }`}
                          />
                        </button>
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-dark-text">{skill.name}</h3>
                      <p className="mt-1 text-xs text-dark-text-secondary leading-relaxed line-clamp-2">{skill.description}</p>
                      <div className="mt-3 flex items-center justify-between">
                        {skill.source && (
                          <span className="text-xs text-dark-text-secondary">
                            来源: {skill.source}
                          </span>
                        )}
                        {isDisabled && (
                          <span className="text-xs text-accent-yellow">已禁用</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Incompatible skills */}
              {skills.filter(s => s.compatible === false).length > 0 && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm text-dark-text-secondary hover:text-dark-text">
                    <span className="ml-1">不兼容的技能 ({skills.filter(s => s.compatible === false).length}) — 这些技能需要 macOS/iOS 或缺少依赖</span>
                  </summary>
                  <div className="mt-3 grid grid-cols-3 gap-4">
                    {skills.filter(s => s.compatible === false).map(skill => (
                      <div
                        key={skill.name}
                        className="rounded-xl border border-dark-border/30 bg-dark-card p-5 opacity-40"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-border/20">
                            <AlertTriangle size={20} className="text-dark-text-secondary" />
                          </div>
                          <span className="rounded bg-dark-border/30 px-2 py-0.5 text-xs text-dark-text-secondary">不兼容</span>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-dark-text">{skill.name}</h3>
                        <p className="mt-1 text-xs text-dark-text-secondary leading-relaxed line-clamp-2">{skill.description}</p>
                        <div className="mt-3">
                          {skill.source && (
                            <span className="text-xs text-dark-text-secondary">来源: {skill.source}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
