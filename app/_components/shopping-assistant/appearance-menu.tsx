import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";

const APPEARANCES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/** A store that never changes, so the subscription only reports having mounted. */
const subscribeToNothing = () => () => {};

/**
 * The Customer's Light, Dark, or System appearance control.
 *
 * The resolved appearance is only known in the browser, so the trigger renders
 * a stable icon until it has mounted rather than guessing and correcting
 * itself. The preference itself is stored and defaulted by the appearance
 * library.
 */
export function AppearanceMenu() {
  const {
    theme: appearance,
    setTheme: setAppearance,
    resolvedTheme: resolvedAppearance,
  } = useTheme();
  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const TriggerIcon =
    isMounted && resolvedAppearance === "dark" ? Moon : isMounted ? Sun : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Appearance"
        >
          <TriggerIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={appearance ?? "system"}
          onValueChange={setAppearance}
        >
          {APPEARANCES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" className="size-3.5" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
