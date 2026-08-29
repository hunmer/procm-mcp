import type { ReactElement } from "react";

export interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  squircle?: boolean;
  [key: string]: unknown;
}

declare const BorderBeam: (props: BorderBeamProps) => ReactElement;
export default BorderBeam;
