/** Table column header with total count: «Заголовок (200)». */
export function colHeader(label: string, total: number): string {
  return total > 0 ? `${label} (${total})` : label;
}

export function statusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" {
  switch (status) {
    case "fetched":
      return "secondary";
    case "needs_review":
      return "warn";
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "info";
  }
}
