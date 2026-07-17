import ralData from "../data/ral-classic.json";

export interface RalColor {
  code: string;
  name: string;
  hex: string;
}

export const RAL_CLASSIC: RalColor[] = ralData as RalColor[];
