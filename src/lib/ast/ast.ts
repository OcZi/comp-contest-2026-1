export interface Node {
	name: string;
	children: Node[];
}

export interface AST {
	parent: Node;
	size: number;
	levels: number;
}
