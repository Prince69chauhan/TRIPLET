import {
  BarChart3,
  Briefcase,
  Code2,
  Palette,
  type LucideIcon,
  Users2,
} from "lucide-react"

export interface JobVisualSource {
  title?: string | null
  department?: string | null
  employment_type?: string | null
}

interface JobVisual {
  icon: LucideIcon
  surfaceClassName: string
  iconClassName: string
}

export function getJobVisual(source: JobVisualSource): JobVisual {
  const signature = `${source.title ?? ""} ${source.department ?? ""} ${source.employment_type ?? ""}`.toLowerCase()

  if (/(design|ui|ux|graphic|creative|product designer)/.test(signature)) {
    return {
      icon: Palette,
      surfaceClassName: "bg-violet-500/10 text-violet-500 ring-violet-500/15",
      iconClassName: "text-violet-500",
    }
  }

  if (/(data|analyst|analytics|bi|machine learning|deep learning|ai|science)/.test(signature)) {
    return {
      icon: BarChart3,
      surfaceClassName: "bg-sky-500/10 text-sky-500 ring-sky-500/15",
      iconClassName: "text-sky-500",
    }
  }

  if (/(frontend|backend|full stack|developer|engineer|software|web|react|node|python|java)/.test(signature)) {
    return {
      icon: Code2,
      surfaceClassName: "bg-primary/10 text-primary ring-primary/15",
      iconClassName: "text-primary",
    }
  }

  if (/(hr|recruit|talent|people|human resource)/.test(signature)) {
    return {
      icon: Users2,
      surfaceClassName: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/15",
      iconClassName: "text-emerald-500",
    }
  }

  return {
    icon: Briefcase,
    surfaceClassName: "bg-primary/10 text-primary ring-primary/15",
    iconClassName: "text-primary",
  }
}
