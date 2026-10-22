import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  forwardRef,
} from 'react';
import { useDrop } from 'react-dnd';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from 'lucide-react';
import { getOutputPorts } from '../lib/ports';
import WorkflowNode, { portHandleOffset } from './WorkflowNode';
import ConnectionLine from './ConnectionLine';
import ConnectionPropertiesModal from './ConnectionPropertiesModal';
import PropertiesPanel from './PropertiesPanel';
import { WorkflowAction, Connection, WorkflowVariable } from '../types/workflow';
import { automationCategories } from '../data/automationCategories';
import { isWorkflowActionExecutable } from '../lib/actionAvailability';

// ─── Constants ────────────────────────────────────────────────────────────────

// Must match the dimensions defined in WorkflowNode.tsx for precise anchoring
export const NODE_WIDTH  = 56;
export const NODE_HEIGHT = 56;

const ZOOM_MIN = 15;
const ZOOM_MAX = 300;
const ZOOM_STEP = 15;
const PAN_SPEED = 45;
const HISTORY_MAX = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shared empty set, so default props keep a stable identity across renders. */
const EMPTY_ID_SET: Set<string> = new Set();

interface WorkflowCanvasProps {
  actions: WorkflowAction[];
  connections: Connection[];
  onAddAction: (action: WorkflowAction) => void;
  onUpdateAction: (action: WorkflowAction) => void;
  onDeleteAction: (actionId: string) => void;
  onAddConnection?: (connection: Connection) => void;
  onDeleteConnection: (connectionId: string) => void;
  onEditConnection: (connection: Connection) => void;
  onSelectNode: (nodeId: string | null) => void;
  selectedNode: string | null;
  connectionStart: { nodeId: string; port: 'output' } | null;
  tempConnection: { x: number; y: number } | null;
  onStartConnection: (nodeId: string, portId?: string | null) => void;
  onUpdateTempConnection: (x: number, y: number) => void;
  onCompleteConnection?: (targetId: string) => void;
  onCancelConnection: () => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  isRunning: boolean;
  activeConnections?: Set<string>;
  invalidNodeIds?: Set<string>;
  variables?: WorkflowVariable[];
  gridSize?: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
  className?: string;

  /** Debugger: node ids carrying an enabled breakpoint. */
  breakpointNodeIds?: Set<string>;
  /** Debugger: node ids carrying a breakpoint that is switched off. */
  disabledBreakpointNodeIds?: Set<string>;
  /** Debugger: node the run is currently parked before. */
  pausedNodeId?: string | null;
  onToggleBreakpoint?: (nodeId: string) => void;
}

interface HistoryState {
  actions: WorkflowAction[];
  connections: Connection[];
}

interface SelectionBox {
  start: { x: number; y: number };
  current: { x: number; y: number };
  active: boolean;
}

interface ConnectionPropsModal {
  isOpen: boolean;
  connection: Connection | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fallback
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapToNearest(value: number, grid: number): number {
  if (grid <= 1) return value;
  return Math.round(value / grid) * grid;
}

function connectionExists(
  connections: Connection[],
  sourceId: string,
  targetId: string
): boolean {
  return connections.some(
    (c) => c.sourceId === sourceId && c.targetId === targetId
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const WorkflowCanvas = forwardRef<HTMLDivElement, WorkflowCanvasProps>(
  (
    {
      actions,
      connections,
      onAddAction,
      onUpdateAction,
      onDeleteAction,
      onAddConnection,
      onDeleteConnection,
      onEditConnection,
      onSelectNode,
      selectedNode,
      connectionStart,
      tempConnection,
      onStartConnection,
      onUpdateTempConnection,
      onCompleteConnection,
      onCancelConnection,
      zoomLevel,
      onZoomChange,
      isRunning,
      activeConnections = new Set<string>(),
      invalidNodeIds = new Set<string>(),
      variables = [],
      gridSize = 20,
      showGrid = true,
      snapToGrid = true,
      className = '',
      breakpointNodeIds = EMPTY_ID_SET,
      disabledBreakpointNodeIds = EMPTY_ID_SET,
      pausedNodeId = null,
      onToggleBreakpoint,
    },
    ref
  ) => {
    const [snapEnabled, setSnapEnabled] = useState(snapToGrid);
    const [gridVisible, setGridVisible] = useState(showGrid);
    const EFFECTIVE_GRID = snapEnabled ? Math.max(1, gridSize) : 1;

    // ─── Local state ──────────────────────────────────────────────────────────

    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
    const [showMiniMap, setShowMiniMap] = useState(false);
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [multiSelectedNodes, setMultiSelectedNodes] = useState<Set<string>>(new Set());
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    const [connectionPropsModal, setConnectionPropsModal] = useState<ConnectionPropsModal>({
      isOpen: false,
      connection: null,
    });
    const [clipboard, setClipboard] = useState<WorkflowAction[]>([]);

    // ─── History ──────────────────────────────────────────────────────────────

    const historyRef = useRef<HistoryState[]>([]);
    const historyIndexRef = useRef(-1);
    const historyPendingRef = useRef(false);

    const pushHistory = useCallback(() => {
      if (historyPendingRef.current) return;
      historyPendingRef.current = true;
      Promise.resolve().then(() => {
        historyPendingRef.current = false;
        const next: HistoryState = {
          actions: deepClone(actions),
          connections: deepClone(connections),
        };
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(next);
        if (historyRef.current.length > HISTORY_MAX) {
          historyRef.current = historyRef.current.slice(
            historyRef.current.length - HISTORY_MAX
          );
        }
        historyIndexRef.current = historyRef.current.length - 1;
      });
    }, [actions, connections]);

    const historySeedRef = useRef(false);
    useEffect(() => {
      if (!historySeedRef.current) {
        historySeedRef.current = true;
        const initial: HistoryState = {
          actions: deepClone(actions),
          connections: deepClone(connections),
        };
        historyRef.current = [initial];
        historyIndexRef.current = 0;
      }
    }, [actions, connections]);

    // ─── Refs ─────────────────────────────────────────────────────────────────

    const canvasRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const dragStateRef = useRef({
      isPanning: false,
      isMarquee: false,
      startX: 0,
      startY: 0,
      initialOffsetX: 0,
      initialOffsetY: 0,
    });

    const prevActionsLengthRef = useRef(actions.length);

    // ─── Derived / memoized ───────────────────────────────────────────────────

    const actionMap = useMemo(
      () => new Map(actions.map((a) => [a.id, a] as const)),
      [actions]
    );

    const selectedAction = useMemo(
      () => (selectedNode ? (actionMap.get(selectedNode) ?? null) : null),
      [selectedNode, actionMap]
    );

    // Bounding box of all elements for minimap & fit-to-view
    const canvasBounds = useMemo(() => {
      if (actions.length === 0) {
        return { minX: 0, minY: 0, maxX: 1600, maxY: 900 };
      }
      const xs = actions.map((a) => a.x ?? 0);
      const ys = actions.map((a) => a.y ?? 0);
      return {
        minX: Math.min(...xs) - 200,
        minY: Math.min(...ys) - 200,
        maxX: Math.max(...xs) + NODE_WIDTH + 200,
        maxY: Math.max(...ys) + NODE_HEIGHT + 200,
      };
    }, [actions]);

    // Pre-calculate exact, precise connection points deeply anchored into the handles
    const connectionPoints = useMemo(() => {
      const pts: Record<
        string,
        { sourceX: number; sourceY: number; targetX: number; targetY: number }
      > = {};
      for (const conn of connections) {
        const src = actionMap.get(conn.sourceId);
        const tgt = actionMap.get(conn.targetId);
        if (!src || !tgt) continue;

        // An edge leaving a named port must leave from THAT handle, not from
        // the node's midpoint. Without this the matched and unmatched edges
        // overlap for their first several pixels and the canvas stops showing
        // which branch is which — the exact thing the ports exist to make
        // visible.
        const ports = getOutputPorts(src as any);
        const portIndex = conn.sourcePort
          ? ports.findIndex((port) => port.id === conn.sourcePort)
          : -1;
        const sourceY =
          portIndex >= 0
            ? (src.y ?? 0) + portHandleOffset(portIndex, ports.length, NODE_HEIGHT)
            : (src.y ?? 0) + NODE_HEIGHT / 2;

        pts[conn.id] = {
          // Sink the source anchor 4px inwards so the path emerges perfectly from under the handle dot
          sourceX: (src.x ?? 0) + NODE_WIDTH - 4,
          sourceY,
          // Sink the target anchor 8px inwards to fully hide the arrowhead tip under the target handle dot
          targetX: (tgt.x ?? 0) + 8,
          targetY: (tgt.y ?? 0) + NODE_HEIGHT / 2,
        };
      }
      return pts;
    }, [actionMap, connections]);

    /**
     * Edge colour by branch tone, so an exception path is amber end to end
     * rather than only at its handle. `undefined` leaves the line's existing
     * colour logic untouched, which is what keeps every unported edge looking
     * exactly as it does today.
     */
    const connectionTone = useMemo(() => {
      const tones: Record<string, string | undefined> = {};
      for (const conn of connections) {
        if (!conn.sourcePort) continue;
        const src = actionMap.get(conn.sourceId);
        const port = getOutputPorts(src as any).find((p) => p.id === conn.sourcePort);
        if (port?.tone === 'exception') tones[conn.id] = '#f59e0b';
      }
      return tones;
    }, [actionMap, connections]);

    // ─── Helpers ──────────────────────────────────────────────────────────────

    const snap = useCallback(
      (v: number) => snapToNearest(v, EFFECTIVE_GRID),
      [EFFECTIVE_GRID]
    );

    const clearSelection = useCallback(() => {
      onSelectNode(null);
      setSelectedConnection(null);
      setMultiSelectedNodes(new Set());
      setIsPropertiesPanelOpen(false);
    }, [onSelectNode]);

    const fitToScreen = useCallback(() => {
      if (!containerRef.current) return;
      const { minX, minY, maxX, maxY } = canvasBounds;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const vw = containerRef.current.clientWidth;
      const vh = containerRef.current.clientHeight;

      const scaleX = (vw - 80) / bw;
      const scaleY = (vh - 80) / bh;
      const newScale = Math.min(Math.max(Math.min(scaleX, scaleY) * 100, ZOOM_MIN), ZOOM_MAX);

      onZoomChange(newScale);
      setOffset({
        x: (vw - bw * (newScale / 100)) / 2 - minX * (newScale / 100),
        y: (vh - bh * (newScale / 100)) / 2 - minY * (newScale / 100),
      });
    }, [canvasBounds, onZoomChange]);

    // ─── Undo / Redo ──────────────────────────────────────────────────────────

    const undo = useCallback(() => {
      if (historyIndexRef.current <= 0) return;
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      if (!prev) return;

      const prevIds = new Set(prev.actions.map((a) => a.id));
      for (const a of prev.actions) onUpdateAction(deepClone(a));
      for (const a of actions) {
        if (!prevIds.has(a.id)) onDeleteAction(a.id);
      }

      const prevConnIds = new Set(prev.connections.map((c) => c.id));
      for (const c of prev.connections) onEditConnection(deepClone(c));
      for (const c of connections) {
        if (!prevConnIds.has(c.id)) onDeleteConnection(c.id);
      }
      clearSelection();
    }, [actions, connections, onUpdateAction, onDeleteAction, onEditConnection, onDeleteConnection, clearSelection]);

    const redo = useCallback(() => {
      if (historyIndexRef.current >= historyRef.current.length - 1) return;
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      if (!next) return;

      const nextIds = new Set(next.actions.map((a) => a.id));
      for (const a of next.actions) onUpdateAction(deepClone(a));
      for (const a of actions) {
        if (!nextIds.has(a.id)) onDeleteAction(a.id);
      }

      const nextConnIds = new Set(next.connections.map((c) => c.id));
      for (const c of next.connections) onEditConnection(deepClone(c));
      for (const c of connections) {
        if (!nextConnIds.has(c.id)) onDeleteConnection(c.id);
      }
      clearSelection();
    }, [actions, connections, onUpdateAction, onDeleteAction, onEditConnection, onDeleteConnection, clearSelection]);

    // ─── Node Handlers ────────────────────────────────────────────────────────

    const handleRenameNode = useCallback((id: string, newName: string) => {
      const action = actionMap.get(id);
      if (!action || action.name === newName) return;
      onUpdateAction({ ...action, name: newName });
      pushHistory();
    }, [actionMap, onUpdateAction, pushHistory]);

    const handleDuplicateNode = useCallback((id: string) => {
      const src = actionMap.get(id);
      if (!src) return;

      const newId = uuidv4();
      const newAction: WorkflowAction = {
        ...deepClone(src),
        id: newId,
        x: snap((src.x ?? 0) + 80),
        y: snap((src.y ?? 0) + 80),
        name: `${src.name} (Copy)`,
        status: 'idle',
      };

      onAddAction(newAction);
      setMultiSelectedNodes(new Set([newId]));
      onSelectNode(newId);
      setIsPropertiesPanelOpen(true);
      pushHistory();
    }, [actionMap, snap, onAddAction, onSelectNode, pushHistory]);

    const handleDeleteNode = useCallback((id: string) => {
      for (const conn of connections) {
        if (conn.sourceId === id || conn.targetId === id) {
          onDeleteConnection(conn.id);
        }
      }
      onDeleteAction(id);

      setMultiSelectedNodes((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      if (selectedNode === id) {
        onSelectNode(null);
        setIsPropertiesPanelOpen(false);
      }

      pushHistory();
    }, [connections, onDeleteConnection, onDeleteAction, selectedNode, onSelectNode, pushHistory]);

    // ─── Effects ──────────────────────────────────────────────────────────────

    // Auto-select newly added node
    useEffect(() => {
      if (actions.length > prevActionsLengthRef.current) {
        const added = actions.slice(prevActionsLengthRef.current);
        const last = added[added.length - 1];
        if (last) {
          onSelectNode(last.id);
          setMultiSelectedNodes(new Set([last.id]));
          setIsPropertiesPanelOpen(true);
          pushHistory();
        }
      }
      prevActionsLengthRef.current = actions.length;
    }, [actions, onSelectNode, pushHistory]);

    // Cleanup selections
    useEffect(() => {
      if (selectedNode && !actionMap.has(selectedNode)) {
        clearSelection();
      }
    }, [actionMap, selectedNode, clearSelection]);

    useEffect(() => {
      if (selectedConnection && !connections.some((c) => c.id === selectedConnection)) {
        setSelectedConnection(null);
      }
    }, [connections, selectedConnection]);

    // ─── Drag / Drop from library ─────────────────────────────────────────────

    const [{ isOver, canDrop }, drop] = useDrop<
      Omit<WorkflowAction, 'id' | 'x' | 'y'>,
      void,
      { isOver: boolean; canDrop: boolean }
    >(
      () => ({
        accept: 'action',
        canDrop: (item) => isWorkflowActionExecutable(item, automationCategories),
        drop: (item, monitor) => {
          if (!isWorkflowActionExecutable(item, automationCategories)) return;

          const clientOffset = monitor.getClientOffset();
          if (!clientOffset || !canvasRef.current) return;

          const rect = canvasRef.current.getBoundingClientRect();
          const scale = zoomLevel / 100;

          const rawX = (clientOffset.x - rect.left - offset.x) / scale;
          const rawY = (clientOffset.y - rect.top - offset.y) / scale;

          const x = snap(rawX - NODE_WIDTH / 2);
          const y = snap(rawY - NODE_HEIGHT / 2);

          const newAction: WorkflowAction = {
            ...deepClone(item as WorkflowAction),
            id: uuidv4(),
            x: Math.max(0, x),
            y: Math.max(0, y),
            status: 'idle',
            properties: deepClone((item as WorkflowAction).properties ?? {}),
          };
          onAddAction(newAction);
        },
        collect: (monitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
      }),
      [zoomLevel, onAddAction, offset, snap]
    );

    // ─── Pointer / Mouse Handlers (Pan & Marquee) ─────────────────────────────

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isBackground =
          target.classList.contains('canvas-background') ||
          target.classList.contains('workflow-canvas') ||
          target === canvasRef.current ||
          target === containerRef.current;

        if (!isBackground) return;

        // Start Marquee (Left click without Space/Middle)
        if (e.button === 0 && !isSpacePressed && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const pos = {
            x: (e.clientX - rect.left - offset.x) / (zoomLevel / 100),
            y: (e.clientY - rect.top - offset.y) / (zoomLevel / 100),
          };
          setSelectionBox({ start: pos, current: pos, active: true });
          dragStateRef.current.isMarquee = true;
          if (!e.shiftKey) clearSelection();
          return;
        }

        // Start Pan (Space+Click, Middle Click, or Shift+Click)
        if (e.button === 1 || isSpacePressed || (e.button === 0 && e.shiftKey)) {
          e.preventDefault();
          dragStateRef.current = {
            isPanning: true,
            isMarquee: false,
            startX: e.clientX,
            startY: e.clientY,
            initialOffsetX: offset.x,
            initialOffsetY: offset.y,
          };
          if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
        }
      },
      [offset, zoomLevel, isSpacePressed, clearSelection]
    );

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        if (dragStateRef.current.isPanning) {
          e.preventDefault();
          setOffset({
            x: dragStateRef.current.initialOffsetX + (e.clientX - dragStateRef.current.startX),
            y: dragStateRef.current.initialOffsetY + (e.clientY - dragStateRef.current.startY),
          });
        }

        if (dragStateRef.current.isMarquee && selectionBox?.active && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const pos = {
            x: (e.clientX - rect.left - offset.x) / (zoomLevel / 100),
            y: (e.clientY - rect.top - offset.y) / (zoomLevel / 100),
          };
          setSelectionBox((prev) => (prev ? { ...prev, current: pos } : null));
        }

        if (connectionStart && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const x = (e.clientX - rect.left - offset.x) / (zoomLevel / 100);
          const y = (e.clientY - rect.top - offset.y) / (zoomLevel / 100);
          onUpdateTempConnection(x, y);
        }
      };

      const onMouseUp = () => {
        if (dragStateRef.current.isPanning) {
          dragStateRef.current.isPanning = false;
          if (canvasRef.current) canvasRef.current.style.cursor = isSpacePressed ? 'grab' : '';
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }

        if (dragStateRef.current.isMarquee && selectionBox?.active) {
          const box = selectionBox;
          const minX = Math.min(box.start.x, box.current.x);
          const maxX = Math.max(box.start.x, box.current.x);
          const minY = Math.min(box.start.y, box.current.y);
          const maxY = Math.max(box.start.y, box.current.y);

          const matched = actions
            .filter((a) => {
              const ax = a.x ?? 0;
              const ay = a.y ?? 0;
              return ax >= minX && ax + NODE_WIDTH <= maxX && ay >= minY && ay + NODE_HEIGHT <= maxY;
            })
            .map((a) => a.id);

          if (matched.length > 0) {
            setMultiSelectedNodes(new Set(matched));
            onSelectNode(matched[0]); // Select first for properties panel
            setIsPropertiesPanelOpen(true);
          } else {
            clearSelection();
          }
          setSelectionBox(null);
          dragStateRef.current.isMarquee = false;
        }
      };

      window.addEventListener('mousemove', onMouseMove, { passive: false });
      window.addEventListener('mouseup', onMouseUp, { passive: false });
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }, [actions, connectionStart, offset, onUpdateTempConnection, onSelectNode, selectionBox, zoomLevel, isSpacePressed, clearSelection]);

    const handleCanvasClick = useCallback(
      (e: React.MouseEvent) => {
        if (dragStateRef.current.isPanning || dragStateRef.current.isMarquee) return;
        const target = e.target as HTMLElement;
        const isBackground =
          target.classList.contains('canvas-background') ||
          target.classList.contains('workflow-canvas') ||
          target === e.currentTarget;

        if (isBackground) {
          clearSelection();
          if (connectionStart) onCancelConnection();
        }
      },
      [connectionStart, onCancelConnection, clearSelection]
    );

    // ─── Smart Zoom (Centered on Cursor) ──────────────────────────────────────

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey)) {
          // Native Trackpad Pan
          setOffset(prev => ({
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY
          }));
          return;
        }
        e.preventDefault();

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const currentScale = zoomLevel / 100;
        const pointX = (mouseX - offset.x) / currentScale;
        const pointY = (mouseY - offset.y) / currentScale;

        // Inertia smooth scale
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel + delta));
        const newScale = newZoom / 100;

        setOffset({
          x: mouseX - pointX * newScale,
          y: mouseY - pointY * newScale,
        });
        onZoomChange(newZoom);
      },
      [offset, zoomLevel, onZoomChange]
    );

    // ─── Node & Connection Interaction ────────────────────────────────────────

    const handleSelectNode = useCallback(
      (nodeId: string | null) => {
        if (nodeId && multiSelectedNodes.has(nodeId) && multiSelectedNodes.size === 1) {
          // Toggle off
          clearSelection();
          return;
        }
        if (nodeId) {
          setMultiSelectedNodes(new Set([nodeId]));
          onSelectNode(nodeId);
          setIsPropertiesPanelOpen(true);
          setSelectedConnection(null);
        } else {
          clearSelection();
        }
      },
      [onSelectNode, clearSelection, multiSelectedNodes]
    );

    const handleSelectConnection = useCallback(
      (connectionId: string) => {
        setSelectedConnection(connectionId);
        onSelectNode(null);
        setMultiSelectedNodes(new Set());
        setIsPropertiesPanelOpen(false);
      },
      [onSelectNode]
    );

    const handleOpenConnectionProps = useCallback((connection: Connection) => {
      setConnectionPropsModal({ isOpen: true, connection });
    }, []);

    const handleDeleteSelectedConnection = useCallback(() => {
      if (!selectedConnection) return;
      onDeleteConnection(selectedConnection);
      setSelectedConnection(null);
      pushHistory();
    }, [onDeleteConnection, pushHistory, selectedConnection]);

    const handleCompleteConnection = useCallback(
      (targetId: string) => {
        if (!connectionStart) return;
        if (connectionStart.nodeId === targetId) {
          onCancelConnection();
          return;
        }
        if (connectionExists(connections, connectionStart.nodeId, targetId)) {
          onCancelConnection();
          return;
        }
        const newConn: Connection = {
          id: uuidv4(),
          sourceId: connectionStart.nodeId,
          targetId,
        };
        if (onAddConnection) {
          onAddConnection(newConn);
        } else {
          onCompleteConnection?.(targetId);
        }
        onCancelConnection();
        pushHistory();
      },
      [connectionStart, connections, onAddConnection, onCompleteConnection, onCancelConnection, pushHistory]
    );

    const handleUpdateConnectionFromModal = useCallback(
      (updated: Connection) => {
        onEditConnection(updated);
        setConnectionPropsModal({ isOpen: false, connection: null });
        pushHistory();
      },
      [onEditConnection, pushHistory]
    );

    const handleMoveNode = useCallback(
      (id: string, x: number, y: number) => {
        const action = actionMap.get(id);
        if (!action) return;

        // If moving a multi-selected node, move all selected nodes
        if (multiSelectedNodes.has(id) && multiSelectedNodes.size > 1) {
          const dx = x - (action.x ?? 0);
          const dy = y - (action.y ?? 0);
          multiSelectedNodes.forEach(selId => {
            const selAction = actionMap.get(selId);
            if (selAction) {
              onUpdateAction({ ...selAction, x: (selAction.x ?? 0) + dx, y: (selAction.y ?? 0) + dy });
            }
          });
        } else {
          onUpdateAction({ ...action, x, y });
        }
        pushHistory();
      },
      [actionMap, onUpdateAction, pushHistory, multiSelectedNodes]
    );

    // ─── Keyboard Shortcuts ───────────────────────────────────────────────────

    useEffect(() => {
      const isInputFocused = () =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement as HTMLElement)?.tagName ?? ''
        );

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space' && !isInputFocused()) {
          e.preventDefault();
          setIsSpacePressed(true);
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
          return;
        }

        const meta = e.ctrlKey || e.metaKey;

        // Undo / Redo
        if (meta && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (meta && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
          return;
        }

        // Delete / Backspace
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused()) {
          e.preventDefault();
          if (selectedConnection) {
            handleDeleteSelectedConnection();
            return;
          }
          if (multiSelectedNodes.size > 0) {
            multiSelectedNodes.forEach(nodeId => {
              for (const conn of connections) {
                if (conn.sourceId === nodeId || conn.targetId === nodeId) {
                  onDeleteConnection(conn.id);
                }
              }
              onDeleteAction(nodeId);
            });
            clearSelection();
            pushHistory();
          }
          return;
        }

        // Clipboard & Selection (Ctrl+C, Ctrl+V, Ctrl+D)
        if (meta && !isInputFocused()) {
          switch (e.key.toLowerCase()) {
            case 'c':
              e.preventDefault();
              if (multiSelectedNodes.size > 0) {
                const toCopy = Array.from(multiSelectedNodes).map(id => actionMap.get(id)).filter(Boolean) as WorkflowAction[];
                setClipboard(deepClone(toCopy));
              }
              break;
            case 'v':
              e.preventDefault();
              if (clipboard.length > 0) {
                const pastedNodes: string[] = [];
                clipboard.forEach(node => {
                  const newId = uuidv4();
                  pastedNodes.push(newId);
                  onAddAction({
                    ...node,
                    id: newId,
                    x: snap((node.x ?? 0) + 80),
                    y: snap((node.y ?? 0) + 80),
                    name: `${node.name} (Copy)`,
                  });
                });
                setMultiSelectedNodes(new Set(pastedNodes));
                if (pastedNodes.length > 0) onSelectNode(pastedNodes[0]);
                pushHistory();
              }
              break;
            case 'd':
              e.preventDefault();
              if (multiSelectedNodes.size > 0) {
                const pastedNodes: string[] = [];
                multiSelectedNodes.forEach(id => {
                  const src = actionMap.get(id);
                  if (src) {
                    const newId = uuidv4();
                    pastedNodes.push(newId);
                    onAddAction({
                      ...deepClone(src),
                      id: newId,
                      x: snap((src.x ?? 0) + 80),
                      y: snap((src.y ?? 0) + 80),
                      name: `${src.name} (Copy)`,
                    });
                  }
                });
                setMultiSelectedNodes(new Set(pastedNodes));
                if (pastedNodes.length > 0) onSelectNode(pastedNodes[0]);
                pushHistory();
              }
              break;
            case 'a':
              e.preventDefault();
              setMultiSelectedNodes(new Set(actions.map(a => a.id!)));
              break;
            case '=':
            case '+':
              e.preventDefault();
              onZoomChange(Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP));
              break;
            case '-':
              e.preventDefault();
              onZoomChange(Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP));
              break;
            case '0':
              e.preventDefault();
              fitToScreen();
              break;
          }
          return;
        }

        // Arrow Panning
        if (!isInputFocused() && !e.altKey && !e.ctrlKey && !e.metaKey) {
          switch (e.key) {
            case 'ArrowUp':
              e.preventDefault();
              setOffset((p) => ({ ...p, y: p.y + PAN_SPEED }));
              break;
            case 'ArrowDown':
              e.preventDefault();
              setOffset((p) => ({ ...p, y: p.y - PAN_SPEED }));
              break;
            case 'ArrowLeft':
              e.preventDefault();
              setOffset((p) => ({ ...p, x: p.x + PAN_SPEED }));
              break;
            case 'ArrowRight':
              e.preventDefault();
              setOffset((p) => ({ ...p, x: p.x - PAN_SPEED }));
              break;
          }
        }

        if (e.key === 'Enter' && selectedConnection) {
          const conn = connections.find((c) => c.id === selectedConnection);
          if (conn) handleOpenConnectionProps(conn);
        }

        if (e.key === 'Escape') {
          clearSelection();
          onCancelConnection();
          setSelectionBox(null);
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          setIsSpacePressed(false);
          if (canvasRef.current) canvasRef.current.style.cursor = '';
        }
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, [
      actionMap, actions, clearSelection, clipboard, connections, handleDeleteSelectedConnection, handleOpenConnectionProps,
      multiSelectedNodes, onAddAction, onCancelConnection, onDeleteAction, onDeleteConnection, onSelectNode, onZoomChange,
      pushHistory, redo, selectedConnection, undo, zoomLevel, fitToScreen, snap
    ]);

    // ─── Combined ref (drop + forwarded ref) ──────────────────────────────────

    const combinedRef = useCallback(
      (node: HTMLDivElement | null) => {
        drop(node);
        canvasRef.current = node;
        if (ref) {
          if (typeof ref === 'function') ref(node);
          else (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [drop, ref]
    );

    // ─── Minimap click ────────────────────────────────────────────────────────

    const handleMinimapClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const rx = (e.clientX - rect.left) / rect.width;
        const ry = (e.clientY - rect.top) / rect.height;
        const bounds = canvasBounds;
        const bw = bounds.maxX - bounds.minX || 1;
        const bh = bounds.maxY - bounds.minY || 1;

        const targetX = bounds.minX + rx * bw;
        const targetY = bounds.minY + ry * bh;
        const vw = containerRef.current?.clientWidth || window.innerWidth;
        const vh = containerRef.current?.clientHeight || window.innerHeight;

        setOffset({
          x: -targetX * (zoomLevel / 100) + vw / 2,
          y: -targetY * (zoomLevel / 100) + vh / 2,
        });
      },
      [canvasBounds, zoomLevel]
    );

    // ─── Background Style (Premium Orchestration Grid) ────────────────────────

    const backgroundStyle = useMemo((): React.CSSProperties => {
      const scale = zoomLevel / 100;
      const size = gridSize * scale;

      if (gridVisible) {
        return {
          backgroundImage: `
            radial-gradient(circle at 10% 40%, rgba(99,102,241,0.025), transparent 50%),
            radial-gradient(circle at 90% 60%, rgba(168,85,247,0.02), transparent 45%),
            radial-gradient(circle at center, rgba(255,255,255,0.045) 1px, transparent 1px)
          `,
          backgroundSize: `auto, auto, ${size}px ${size}px`,
          backgroundPosition: `center, center, ${offset.x}px ${offset.y}px`,
        };
      }
      return {
        backgroundImage: `
          radial-gradient(circle at 10% 40%, rgba(99,102,241,0.025), transparent 50%),
          radial-gradient(circle at 90% 60%, rgba(168,85,247,0.02), transparent 45%)
        `,
        backgroundSize: 'auto, auto',
        backgroundPosition: 'center, center',
      };
    }, [gridVisible, gridSize, offset.x, offset.y, zoomLevel]);

    // ─── Bezier Line Rendering (Preview) ──────────────────────────────────────

    const tempConnectionPath = useMemo(() => {
      if (!connectionStart || !tempConnection) return null;
      const src = actionMap.get(connectionStart.nodeId);
      if (!src) return null;

      // Precisely sink the connection point to match the ConnectionLine component
      const sx = (src.x ?? 0) + NODE_WIDTH - 4;
      const sy = (src.y ?? 0) + NODE_HEIGHT / 2;
      const tx = tempConnection.x;
      const ty = tempConnection.y;

      const isMovingBackwards = tx < sx;
      const dx = Math.abs(tx - sx);
      const dy = Math.abs(ty - sy);

      // Tight smooth bezier routing perfectly tracking the cursor
      const cpX = Math.max(dx * 0.45, isMovingBackwards ? dy * 0.5 + 40 : 40);

      return `M ${sx} ${sy} C ${sx + cpX} ${sy}, ${tx - cpX} ${ty}, ${tx} ${ty}`;
    }, [actionMap, connectionStart, tempConnection]);

    // ─── Auto layout (presentation only; repositions nodes, no model change) ───
    const handleAutoLayout = useCallback(() => {
      if (actions.length === 0) return;
      pushHistory();

      const GAP_X = NODE_WIDTH + 200;
      const GAP_Y = NODE_HEIGHT + 90;
      const ORIGIN_X = 120;
      const ORIGIN_Y = 120;

      // Build dependency graph from connections (source -> targets).
      const outgoing = new Map<string, string[]>();
      const indeg = new Map<string, number>();
      for (const a of actions) {
        if (a.id) indeg.set(a.id, 0);
      }
      for (const c of connections as any[]) {
        const from = c.sourceId ?? c.source ?? c.from;
        const to = c.targetId ?? c.target ?? c.to;
        if (!from || !to || !indeg.has(from) || !indeg.has(to)) continue;
        outgoing.set(from, [...(outgoing.get(from) ?? []), to]);
        indeg.set(to, (indeg.get(to) ?? 0) + 1);
      }

      // Assign layer = longest path depth from a root (Kahn-style BFS).
      const depth = new Map<string, number>();
      let frontier = actions.map((a) => a.id!).filter((id) => (indeg.get(id) ?? 0) === 0);
      if (frontier.length === 0) frontier = actions.map((a) => a.id!); // cyclic / no roots
      frontier.forEach((id) => depth.set(id, 0));
      const queue = [...frontier];
      let guard = 0;
      while (queue.length && guard < 10000) {
        guard++;
        const id = queue.shift()!;
        const d = depth.get(id) ?? 0;
        for (const next of outgoing.get(id) ?? []) {
          const nd = Math.max(depth.get(next) ?? 0, d + 1);
          if (nd !== depth.get(next)) {
            depth.set(next, nd);
            queue.push(next);
          }
        }
      }

      // Group by layer, then stack vertically (centered).
      const layers = new Map<number, string[]>();
      for (const a of actions) {
        const d = depth.get(a.id!) ?? 0;
        layers.set(d, [...(layers.get(d) ?? []), a.id!]);
      }
      const maxRows = Math.max(...Array.from(layers.values()).map((l) => l.length), 1);

      for (const [layer, ids] of layers) {
        const offsetY = ((maxRows - ids.length) * GAP_Y) / 2;
        ids.forEach((id, row) => {
          const action = actionMap.get(id);
          if (!action) return;
          onUpdateAction({
            ...deepClone(action),
            x: snap(ORIGIN_X + layer * GAP_X),
            y: snap(ORIGIN_Y + offsetY + row * GAP_Y),
          });
        });
      }
    }, [actions, connections, actionMap, onUpdateAction, snap, pushHistory]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden bg-[#070B14] text-slate-200 outline-none ${className}`}
        tabIndex={-1}
      >
        <div
          className="canvas-background absolute inset-0 z-0 transition-opacity duration-300 pointer-events-none"
          style={backgroundStyle}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0D14]/20 via-transparent to-[#0A0D14]/80 pointer-events-none z-0" />

        <div
          ref={combinedRef}
          className={`workflow-canvas w-full h-full relative z-10 transition-cursor duration-150 ${isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
          onMouseDown={handleMouseDown}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          style={{ touchAction: 'none' }}
        >
          {/* Empty State Instructions */}
          {actions.length === 0 && !isOver && (
            <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
              <div className="max-w-md w-full rounded-[18px] border border-white/[0.05] bg-[#0E131F]/60 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] px-8 py-10 text-center transform transition-all duration-700">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-indigo-500/10 to-violet-500/10 border border-white/5 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]">
                  <Icons.Workflow className="h-7 w-7 text-indigo-400 drop-shadow-md" />
                </div>
                <h2 className="text-lg font-semibold tracking-wide text-slate-200">Orchestration Canvas</h2>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-400 font-medium max-w-sm mx-auto">
                  Drag modules from the sidebar. Use <kbd className="font-mono text-[10px] bg-white/10 px-1 rounded mx-0.5">Space</kbd> + Drag to pan. Drag to select multiple nodes.
                </p>
              </div>
            </div>
          )}

          {/* Drag Overlay */}
          {isOver && canDrop && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 bg-indigo-500/5 backdrop-blur-[2px] transition-all">
              <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-6 py-4 text-center shadow-[0_0_40px_rgba(99,102,241,0.15)] backdrop-blur-lg">
                <Icons.Plus className="h-6 w-6 text-indigo-300 mx-auto mb-2" />
                <div className="text-xs font-bold tracking-widest uppercase text-indigo-200">
                  Drop to Add
                </div>
              </div>
            </div>
          )}

          {/* Canvas Tools Overlay (Zoom & Minimap) */}
          <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-3">
            <div className="rounded-[18px] border border-white/[0.04] bg-[#0B1220]/72 backdrop-blur-lg shadow-2xl p-1 flex flex-col items-center gap-0.5">
              <button
                onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP))}
                className="p-2 text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all"
                title="Zoom In (Ctrl +)"
                aria-label="Zoom in"
              >
                <Icons.Plus className="w-4 h-4" />
              </button>
              <div className="w-4 h-px bg-white/10 my-0.5" />
              <button
                onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP))}
                className="p-2 text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all"
                title="Zoom Out (Ctrl -)"
                aria-label="Zoom out"
              >
                <Icons.Minus className="w-4 h-4" />
              </button>
              <div className="w-4 h-px bg-white/10 my-0.5" />
              <button
                onClick={fitToScreen}
                className="p-2 text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all"
                title="Fit to Screen (Ctrl 0)"
                aria-label="Fit to screen"
              >
                <Icons.Maximize className="w-4 h-4" />
              </button>
              <div className="w-4 h-px bg-white/10 my-0.5" />
              <button
                onClick={() => setShowMiniMap((p) => !p)}
                className={`p-2 rounded-xl transition-all ${
                  showMiniMap
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
                title="Toggle Minimap"
                aria-label="Toggle minimap"
                aria-pressed={showMiniMap}
              >
                <Icons.Map className="w-4 h-4" />
              </button>
            </div>

            {/* Layout & grid controls */}
            <div className="rounded-[18px] border border-white/[0.04] bg-[#0B1220]/72 backdrop-blur-lg shadow-2xl p-1 flex flex-col items-center gap-0.5">
              <button
                onClick={handleAutoLayout}
                className="p-2 text-slate-400 hover:bg-white/10 hover:text-white rounded-xl transition-all"
                title="Auto layout"
                aria-label="Auto layout"
              >
                <Icons.LayoutGrid className="w-4 h-4" />
              </button>
              <div className="w-4 h-px bg-white/10 my-0.5" />
              <button
                onClick={() => setSnapEnabled((p) => !p)}
                className={`p-2 rounded-xl transition-all ${
                  snapEnabled
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
                title={snapEnabled ? 'Snap to grid: on' : 'Snap to grid: off'}
                aria-label="Toggle snap to grid"
                aria-pressed={snapEnabled}
              >
                <Icons.Magnet className="w-4 h-4" />
              </button>
              <div className="w-4 h-px bg-white/10 my-0.5" />
              <button
                onClick={() => setGridVisible((p) => !p)}
                className={`p-2 rounded-xl transition-all ${
                  gridVisible
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
                title={gridVisible ? 'Grid: on' : 'Grid: off'}
                aria-label="Toggle grid"
                aria-pressed={gridVisible}
              >
                <Icons.Grid3x3 className="w-4 h-4" />
              </button>
            </div>

            {/* Minimap Widget */}
            {showMiniMap && (
              <div className="w-64 rounded-[18px] border border-white/[0.04] bg-[#0B1220]/78 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] p-3 animate-in fade-in slide-in-from-right-4">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Minimap</div>
                </div>
                <div
                  className="relative h-28 w-full cursor-crosshair overflow-hidden rounded-xl border border-white/[0.04] bg-[#050812]/80 shadow-inner"
                  onClick={handleMinimapClick}
                >
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(rgba(255,255,255,0.2)_1px,transparent_1px)] [background-size:6px_6px]" />
                  {actions.map((action) => {
                    const bounds = canvasBounds;
                    const bw = bounds.maxX - bounds.minX || 1;
                    const bh = bounds.maxY - bounds.minY || 1;
                    const x = (((action.x ?? 0) - bounds.minX) / bw) * 100;
                    const y = (((action.y ?? 0) - bounds.minY) / bh) * 100;
                    const isSel = multiSelectedNodes.has(action.id!);
                    return (
                      <div
                        key={action.id}
                        className={`absolute rounded-[2px] transition-all duration-300 ${
                          isSel
                            ? 'h-2 w-3 bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)] z-10'
                            : 'h-1.5 w-2 bg-slate-500/70'
                        }`}
                        style={{
                          left: `calc(${x}% - ${isSel ? 6 : 4}px)`,
                          top: `calc(${y}% - ${isSel ? 4 : 3}px)`,
                        }}
                      />
                    );
                  })}
                  {/* Viewport Indicator */}
                  {(() => {
                    const bounds = canvasBounds;
                    const bw = bounds.maxX - bounds.minX || 1;
                    const bh = bounds.maxY - bounds.minY || 1;
                    const scale = zoomLevel / 100;
                    const vw = containerRef.current?.clientWidth || window.innerWidth;
                    const vh = containerRef.current?.clientHeight || window.innerHeight;
                    return (
                      <div
                        className="absolute rounded border border-indigo-400/50 bg-indigo-400/10 shadow-[0_0_10px_rgba(99,102,241,0.1)] pointer-events-none transition-all duration-75"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((-offset.x / scale) - bounds.minX) / bw * 100))}%`,
                          top: `${Math.max(0, Math.min(100, ((-offset.y / scale) - bounds.minY) / bh * 100))}%`,
                          width: `${Math.min(100, (vw / scale / bw) * 100)}%`,
                          height: `${Math.min(100, (vh / scale / bh) * 100)}%`,
                        }}
                      />
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Transformed Content */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoomLevel / 100})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Selection Marquee Box */}
            {selectionBox?.active && (
              <div
                className="absolute z-30 rounded-lg border border-indigo-400/60 bg-indigo-500/10 backdrop-blur-[1px] pointer-events-none"
                style={{
                  left: Math.min(selectionBox.start.x, selectionBox.current.x),
                  top: Math.min(selectionBox.start.y, selectionBox.current.y),
                  width: Math.abs(selectionBox.current.x - selectionBox.start.x),
                  height: Math.abs(selectionBox.current.y - selectionBox.start.y),
                }}
              />
            )}

            {/* SVG Lines Layer */}
            <svg
              className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
              style={{ zIndex: 5 }}
            >
              <defs>
                <linearGradient id="tempConnectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
                <marker
                  id="tempArrowHead"
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="6"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 0 2 L 10 6 L 0 10 L 3 6 z" fill="url(#tempConnectionGradient)" />
                </marker>
                <filter id="edgeGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <g className="pointer-events-auto">
                {connections.map((conn) => {
                  const pts = connectionPoints[conn.id];
                  if (!pts) return null;
                  return (
                    <ConnectionLine
                      key={conn.id}
                      connection={conn}
                      sourceX={pts.sourceX}
                      sourceY={pts.sourceY}
                      targetX={pts.targetX}
                      targetY={pts.targetY}
                      onDelete={onDeleteConnection}
                      onEdit={handleOpenConnectionProps}
                      onSelect={handleSelectConnection}
                      isSelected={selectedConnection === conn.id}
                      status={activeConnections.has(conn.id) ? 'running' : 'idle'}
                      branchTone={connectionTone[conn.id] ? 'exception' : null}
                    />
                  );
                })}
              </g>

              {/* Connecting Preview Line */}
              {tempConnectionPath && (
                <g>
                  {/* Interaction Invisible Buffer */}
                  <path
                    d={tempConnectionPath}
                    stroke="rgba(255,255,255,0.02)"
                    strokeWidth="10"
                    fill="none"
                    className="pointer-events-none"
                  />
                  {/* Animated Dashed Edge */}
                  <path
                    d={tempConnectionPath}
                    stroke="url(#tempConnectionGradient)"
                    strokeWidth="2.1"
                    strokeDasharray="6,8"
                    fill="none"
                    markerEnd="url(#tempArrowHead)"
                    filter="url(#edgeGlow)"
                    className="pointer-events-none animate-[dash_1s_linear_infinite]"
                  />
                </g>
              )}
            </svg>

            {/* Nodes Layer */}
            {actions.map((action) => {
              const isNodeDisabled = action.disabled === true;
              return (
                <div
                  key={action.id}
                  style={{
                    opacity: isNodeDisabled ? 0.45 : 1,
                    filter: isNodeDisabled ? 'grayscale(0.85)' : 'none',
                    transition: 'opacity 0.2s ease, filter 0.2s ease',
                  }}
                >
                  <WorkflowNode
                    action={action as any}
                    onMove={handleMoveNode}
                    onDelete={handleDeleteNode}
                    onSelect={handleSelectNode}
                    isSelected={multiSelectedNodes.has(action.id!)}
                    onStartConnection={onStartConnection}
                    onCompleteConnection={handleCompleteConnection}
                    onRename={handleRenameNode}
                    onDuplicate={handleDuplicateNode}
                    zoomLevel={zoomLevel}
                    isRunning={isRunning && activeConnections.size > 0}
                    isConnecting={!!connectionStart}
                    isInvalid={invalidNodeIds.has(action.id!)}
                    gridSize={EFFECTIVE_GRID}
                    hasBreakpoint={
                      breakpointNodeIds.has(action.id!) ||
                      disabledBreakpointNodeIds.has(action.id!)
                    }
                    breakpointDisabled={disabledBreakpointNodeIds.has(action.id!)}
                    isPausedHere={pausedNodeId === action.id}
                    onToggleBreakpoint={onToggleBreakpoint}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Properties Panel Integration */}
        <PropertiesPanel
          key={selectedNode ?? 'no-selection'}
          action={selectedAction}
          onUpdateAction={onUpdateAction}
          isOpen={isPropertiesPanelOpen}
          onToggle={() => {
            setIsPropertiesPanelOpen(false);
            clearSelection();
          }}
          variables={variables}
        />

        {/* Global Footer Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 rounded-full border border-white/[0.04] bg-[#0B1220]/78 backdrop-blur-lg shadow-[0_10px_30px_rgba(0,0,0,0.42)] px-4 py-2 text-[10px] font-medium tracking-wide text-slate-400 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-2 group cursor-pointer hover:text-white transition-colors"
            onClick={() => onZoomChange(100)}
            title="Reset zoom to 100%"
          >
            <Icons.Search className="w-3.5 h-3.5 text-indigo-400" />
            <span className="tabular-nums font-semibold text-slate-200">{Math.round(zoomLevel)}%</span>
          </button>
          <span className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Icons.Layers className="w-3.5 h-3.5" />
            <span>{actions.length} Nodes</span>
          </div>
          <span className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Icons.GitCommit className="w-3.5 h-3.5" />
            <span>{connections.length} Edges</span>
          </div>

          {(multiSelectedNodes.size > 0 || selectedConnection) && (
            <>
              <span className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 text-indigo-300">
                <Icons.MousePointer2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {selectedConnection ? 'Edge Selected' : `${multiSelectedNodes.size} Node${multiSelectedNodes.size > 1 ? 's' : ''} Selected`}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Connecting Target Hint Toast */}
        {connectionStart && (
          <div className="absolute top-8 left-1/2 z-40 -translate-x-1/2 rounded-full border border-indigo-500/40 bg-[#0E131F]/95 backdrop-blur-2xl shadow-[0_8px_32px_rgba(99,102,241,0.2)] px-6 py-3 text-sm text-slate-200 animate-in slide-in-from-top-6">
            <div className="flex items-center gap-3">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </div>
              <span className="font-semibold text-indigo-100 text-[13px]">
                Select target handle to complete edge
              </span>
              <span className="h-4 w-px bg-white/10 mx-1" />
              <div className="flex items-center gap-1.5 opacity-70">
                <kbd className="font-mono text-[10px] uppercase bg-white/10 px-1.5 py-0.5 rounded border border-white/10">Esc</kbd>
                <span className="text-[10px]">Cancel</span>
              </div>
            </div>
          </div>
        )}

        <ConnectionPropertiesModal
          connection={connectionPropsModal.connection}
          actions={actions}
          isOpen={connectionPropsModal.isOpen}
          onClose={() => setConnectionPropsModal({ isOpen: false, connection: null })}
          onSave={handleUpdateConnectionFromModal}
        />

        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes dash {
                to { stroke-dashoffset: -14; }
              }
              .transition-cursor {
                transition: cursor 0.1s;
              }
            `,
          }}
        />
      </div>
    );
  }
);

WorkflowCanvas.displayName = 'WorkflowCanvas';
export default WorkflowCanvas;