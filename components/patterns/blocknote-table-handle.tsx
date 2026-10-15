import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ComponentProps,
} from "react";
import { TableHandle, type TableHandleProps } from "@blocknote/react";
import {
  ShadCNComponentsContext,
  ShadCNDefaultComponents,
  useShadCNComponentsContext,
} from "@blocknote/shadcn";

const TableOrientationContext =
  createContext<TableHandleProps["orientation"]>("row");
const NativeTrigger = ShadCNDefaultComponents.DropdownMenu.DropdownMenuTrigger;

function CompletedClickTrigger(props: ComponentProps<typeof NativeTrigger>) {
  const orientation = useContext(TableOrientationContext);
  const dragged = useRef(false);
  return (
    <NativeTrigger
      {...props}
      data-writing-table-grip={orientation}
      aria-label={orientation === "row" ? "Row actions" : "Column actions"}
      onPointerDown={(event) => {
        dragged.current = false;
        props.onPointerDown?.(event);
        // Use Base UI's documented event override, without preventing browser
        // defaults. Its click fallback opens on release; native drag stays intact.
        event.preventBaseUIHandler();
      }}
      onMouseDown={(event) => {
        props.onMouseDown?.(event);
        event.preventBaseUIHandler();
      }}
      onDragStartCapture={(event) => {
        dragged.current = true;
        props.onDragStartCapture?.(event);
      }}
      onClick={(event) => {
        if (dragged.current) {
          event.preventBaseUIHandler();
          return;
        }
        props.onClick?.(event);
      }}
      onKeyDown={(event) => {
        // Keyboard activation remains available immediately after a drag.
        if (event.key === "Enter" || event.key === " ") dragged.current = false;
        props.onKeyDown?.(event);
      }}
    />
  );
}

export function WritingTableHandle(props: TableHandleProps) {
  const components = useShadCNComponentsContext()!;
  const scopedComponents = useMemo(
    () => ({
      ...components,
      DropdownMenu: {
        ...components.DropdownMenu,
        DropdownMenuTrigger: CompletedClickTrigger,
      },
    }),
    [components],
  );
  return (
    <TableOrientationContext.Provider value={props.orientation}>
      <ShadCNComponentsContext.Provider value={scopedComponents}>
        {/* Retain upstream drag operations, menu items, focus and portal handling. */}
        <TableHandle {...props} />
      </ShadCNComponentsContext.Provider>
    </TableOrientationContext.Provider>
  );
}
