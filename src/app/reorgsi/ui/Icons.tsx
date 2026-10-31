import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react/dist/lib/types";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CloudArrowUpIcon } from "@phosphor-icons/react/dist/ssr/CloudArrowUp";
import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CameraIcon } from "@phosphor-icons/react/dist/ssr/Camera";
import { ImagesIcon } from "@phosphor-icons/react/dist/ssr/Images";
import { ScanIcon } from "@phosphor-icons/react/dist/ssr/Scan";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { CoinsIcon } from "@phosphor-icons/react/dist/ssr/Coins";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { GearSixIcon } from "@phosphor-icons/react/dist/ssr/GearSix";
import { HouseLineIcon } from "@phosphor-icons/react/dist/ssr/HouseLine";
import { KeyIcon } from "@phosphor-icons/react/dist/ssr/Key";
import { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr/Receipt";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";

/* Interface icons come from Phosphor (MIT, phosphoricons.com). Navigation uses
   the duotone weight so the sections read at a glance; actions stay regular.

   The four glyphs of the business — house, key, person, coin — are kept as
   paths here because the intro orb draws them on canvas. */

export const GLYPHS = {
  house: "M4 11.2 12 4.5l8 6.7M6.5 9.4V19h11V9.4M10 19v-5h4v5",
  key: "M14.8 9.2a4.2 4.2 0 1 0-1.6 3.3L19 18.3M16.6 15.9l1.8-1.8M14.6 13.9l1.6-1.6",
  person: "M12 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM5.5 19.5c.8-3.5 3.4-5.4 6.5-5.4s5.7 1.9 6.5 5.4",
  coin: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM14.8 9.3a3.4 3.4 0 1 0 0 5.4M8.4 11h4.8M8.4 13h4.8",
} as const;

type P = { size?: number; className?: string; weight?: IconWeight };

function icon(Glyph: PhosphorIcon, weight: IconWeight = "regular") {
  const Wrapped = ({ size = 20, className, weight: w }: P) => (
    <Glyph size={size} className={className} weight={w ?? weight} aria-hidden="true" />
  );
  return Wrapped;
}

// Navigation
export const IconHome = icon(SquaresFourIcon, "duotone");
export const IconKey = icon(KeyIcon, "duotone");
export const IconPeople = icon(UsersThreeIcon, "duotone");
export const IconChart = icon(ChartLineUpIcon, "duotone");
export const IconLedger = icon(ReceiptIcon, "duotone");
export const IconSettings = icon(GearSixIcon, "duotone");
export const IconHouse = icon(HouseLineIcon, "duotone");
export const IconCoin = icon(CoinsIcon, "duotone");

// Actions
export const IconMenu = icon(ListIcon);
export const IconClose = icon(XIcon);
export const IconPlus = icon(PlusIcon, "bold");
export const IconUpload = icon(UploadSimpleIcon);
export const IconFile = icon(FileTextIcon, "duotone");
export const IconExternal = icon(ArrowSquareOutIcon);
export const IconChevronLeft = icon(CaretLeftIcon, "bold");
export const IconChevronRight = icon(CaretRightIcon, "bold");
export const IconDownload = icon(DownloadSimpleIcon);
export const IconTrash = icon(TrashIcon);
export const IconSearch = icon(MagnifyingGlassIcon);
export const IconCheck = icon(CheckIcon, "bold");
export const IconCheckCircle = icon(CheckCircleIcon, "fill");
export const IconCloudUpload = icon(CloudArrowUpIcon, "duotone");
export const IconEye = icon(EyeIcon);
export const IconCamera = icon(CameraIcon, "fill");
export const IconRotate = icon(ArrowClockwiseIcon, "bold");
export const IconImages = icon(ImagesIcon);
export const IconScan = icon(ScanIcon, "bold");

/** Brand mark: a roof line held inside an orbit — the house at the centre of
 *  the team's work. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="#152d35" stroke="#345b63" />
      <ellipse cx="20" cy="20" rx="17" ry="7" fill="none" stroke="#d4ecdd" strokeOpacity="0.35" transform="rotate(-24 20 20)" />
      <path d="M11.5 21.5 20 13.5l8.5 8M14 19.6V27h12v-7.4" fill="none" stroke="#d4ecdd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="33" cy="13" r="2.2" fill="#d4ecdd" />
    </svg>
  );
}
