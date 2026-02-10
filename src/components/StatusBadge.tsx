import { ReactNode } from "react";

interface StatusBadgeProps {
  status: string;
  children?: ReactNode;
}

const statusClasses: Record<string, string> = {
  draft: "status-badge status-draft",
  submitted: "status-badge status-submitted",
  "in review": "status-badge status-submitted",
  "in_review": "status-badge status-submitted",
  approved: "status-badge status-approved",
  rejected: "status-badge status-rejected",
  returned: "status-badge status-rejected",
  active: "status-badge status-approved",
  inactive: "status-badge status-draft",
  mobilized: "status-badge status-approved",
  pending: "status-badge status-submitted",
  terminated: "status-badge status-rejected",
  paid: "status-badge status-approved",
  cancelled: "status-badge status-rejected",
  open: "status-badge status-approved",
  closed: "status-badge status-draft",
  locked: "status-badge status-rejected",
};

export default function StatusBadge({ status, children }: StatusBadgeProps) {
  const cls = statusClasses[status.toLowerCase()] || "status-badge status-draft";
  return <span className={cls}>{children || status}</span>;
}
