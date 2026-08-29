"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  avatarGradient,
  initialsFor,
  resolveAvatarSrc,
} from "@/lib/tenant-avatar";

export function SalaryStaffPicker({
  defaultStaffId,
  staffOptions,
}: {
  defaultStaffId: string;
  staffOptions: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const staffFor = (id: string) => staffOptions.find((s) => s.id === id) ?? null;

  return (
    <Select
      value={defaultStaffId}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next) {
          params.set("staffId", next);
        } else {
          params.delete("staffId");
        }
        router.replace(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-full sm:w-64">
        <SelectValue placeholder="Choose a staff member">
          {(value: string) => {
            const staffMember = staffFor(value);
            if (!staffMember) return "Choose a staff member";
            const name = `${staffMember.firstName} ${staffMember.lastName}`.trim();
            return (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar className="size-5 shrink-0">
                  <AvatarImage src={resolveAvatarSrc(staffMember.avatarUrl, name)} alt={name} />
                  <AvatarFallback
                    className="!text-white text-[10px] font-semibold"
                    style={{ backgroundImage: avatarGradient(name) }}
                  >
                    {initialsFor(name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{name}</span>
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {staffOptions.map((staffMember) => {
          const name = `${staffMember.firstName} ${staffMember.lastName}`.trim();
          return (
            <SelectItem key={staffMember.id} value={staffMember.id}>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar className="size-5 shrink-0">
                  <AvatarImage src={resolveAvatarSrc(staffMember.avatarUrl, name)} alt={name} />
                  <AvatarFallback
                    className="!text-white text-[10px] font-semibold"
                    style={{ backgroundImage: avatarGradient(name) }}
                  >
                    {initialsFor(name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{name}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

