// Design Ref: §3.2 ② 상단 오른쪽 — 로그인한 사람(역할) · 로그아웃
import { logout } from "@/app/login/actions";
import { Button } from "@/components/Button";
import { requireStaff, ROLE_LABEL } from "@/lib/auth/session";

export async function StaffMenu() {
  const staff = await requireStaff();
  return (
    <>
      <span className="text-sm">
        <span className="font-semibold">{staff.name}</span>
        <span className="ml-2 rounded bg-background px-2 py-0.5 text-xs text-muted">{ROLE_LABEL[staff.role]}</span>
      </span>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          로그아웃
        </Button>
      </form>
    </>
  );
}
