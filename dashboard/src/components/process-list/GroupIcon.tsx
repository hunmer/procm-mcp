import { FolderIcon } from "lucide-react";
import { cn } from "@/registry/default/lib/utils";

interface GroupIconProps {
  imageIcon?: string;
  className?: string;
}

export function GroupIcon({ imageIcon, className }: GroupIconProps) {
  if (imageIcon) {
    return (
      <img
        src={imageIcon}
        alt=""
        aria-hidden="true"
        className={cn("size-4 shrink-0 rounded-sm object-cover", className)}
      />
    );
  }

  return (
    <FolderIcon
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  );
}
