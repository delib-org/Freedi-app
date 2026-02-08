import { Results, Statement } from '@freedi/shared-types';
import dagre from "@dagrejs/dagre";
import { Edge, Node, Position } from "reactflow";
import { statementTitleToDisplay } from "@/controllers/general/helpers";

const position = { x: 0, y: 0 };

export const getLayoutElements = (
  nodes: Node[],
  edges: Edge[],
  defaultNodeHeight: number,
  defaultNodeWidth: number,
  direction = "TB",
  nodePadding = 46
) => {
  try {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    const isHorizontal = direction === "LR";

    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: isHorizontal ? nodePadding : 20,
      ranksep: isHorizontal ? 150 : nodePadding * 2,
      marginx: 20,
      marginy: 20,
    });

    nodes.forEach((node) => {
      const nodeWidth = node.data.dimensions?.width ?? defaultNodeWidth;
      const nodeHeight = node.data.dimensions?.height ?? defaultNodeHeight;

      dagreGraph.setNode(node.id, {
        width: nodeWidth,
        height: nodeHeight,
      });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      const nodeWidth = node.data.dimensions?.width ?? defaultNodeWidth;
      const nodeHeight = node.data.dimensions?.height ?? defaultNodeHeight;

      node.targetPosition = isHorizontal ? Position.Left : Position.Top;
      node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

      node.position = {
        x: nodeWithPosition.x - nodeWidth / (!isHorizontal ? 2 : 10),
        y: nodeWithPosition.y - nodeHeight / (isHorizontal ? 2 : 10),
      };

      return node;
    });

    return { nodes, edges };
  } catch (error) {
    console.error("getLayoutedElements() failed: ", error);

    return { nodes: [], edges: [] };
  }
};

export const edgeStyle = {
  stroke: "#000",
  strokeWidth: 1,
  strokeOpacity: 0.5,
};

export const nodeOptions = (
  result: Results,
  parentStatement: "top" | Statement
) => {
  const { statement } = result.top;
  const { shortVersion: nodeTitle } = statementTitleToDisplay(statement, 80);

  const estimatedWidth = Math.min(Math.max(nodeTitle.length * 8, 100), 300);
  const estimatedHeight = Math.ceil(nodeTitle.length / 25) * 20 + 40;

  return {
    id: result.top.statementId,
    data: {
      result,
      parentStatement,
      createdAt: result.top.createdAt,
      dimensions: {
        width: estimatedWidth,
        height: estimatedHeight,
      },
    },
    position,
    type: "custom",
    // Don't set draggable here - let ReactFlow handle it via nodesDraggable prop
  };
};

export const edgeOptions = (result: Results, parentId: string): Edge => {
  try {
    return {
      id: `e${parentId}-${result.top.statementId}`,
      source: parentId,
      target: result.top.statementId,
      style: edgeStyle,
    };
  } catch (error) {
    console.error("edgeOptions() failed: ", error);

    return {
      id: "",
      source: "",
      target: "",
      style: edgeStyle,
    };
  }
};

export const createInitialNodesAndEdges = (
  result: Results | undefined
): { nodes: Node[]; edges: Edge[] } => {
  try {
    if (!result) return { nodes: [], edges: [] };
    const edges: Edge[] = [];
    const nodes: Node[] = [nodeOptions(result, "top")];
    if (!result.sub || result?.sub?.length === 0) return { nodes, edges };
    createNodes(result.sub, result.top);
    function createNodes(results: Results[], parentStatement: Statement) {
      results.forEach((sub) => {
        nodes.push(nodeOptions(sub, parentStatement));
        edges.push(edgeOptions(sub, parentStatement.statementId));
        if (sub.sub && sub.sub.length > 0) {
          createNodes(sub.sub, sub.top);
        }
      });
    }

    return { nodes, edges };
  } catch (error) {
    console.error("createInitialElements() failed: ", error);

    return { nodes: [], edges: [] };
  }
};
