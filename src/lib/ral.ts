import ralData from "../data/ral-classic.json";
import ralDesignData from "../data/ral-design-plus.json";

export interface RalColor {
  code: string;
  name: string;
  hex: string;
}

export const RAL_CLASSIC: RalColor[] = ralData as RalColor[];

export const RAL_DESIGN_PLUS: RalColor[] = ralDesignData as RalColor[];
