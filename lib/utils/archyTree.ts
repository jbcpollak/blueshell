import {Base} from '../nodes/Base';
import {BlueshellState} from '../nodes/BlueshellState';

import * as archy from 'archy';
import {Data} from 'archy';

function buildArchyTree<S extends BlueshellState, E>(
	node: Base<S, E>, contextDepth: number, state?: S
): Required<Data>|undefined {
	let label = node.name;

	if (label !== node.constructor.name) {
		label += ' (' + node.constructor.name + ')';
	}

	let onPath = false;

	if (state) {
		const eventCounter = node.getTreeEventCounter(state);
		const lastEventSeen = node.getLastEventSeen(state);
		const lastResult = node.getLastResult(state);

		if (lastEventSeen === eventCounter && lastResult) {
			label += ' => ' + lastResult;
			onPath = true;
		}
	}

	if (!onPath) {
		if (contextDepth < 0) {
			return undefined;
		}

		if (contextDepth === 0) {
			return {
				label: '...',
				nodes: [],
			};
		}
	}

	const nodes = [];

	if ((<any>node).children) {
		for (const child of (<any>node).children) {
			const childDepth = contextDepth - (onPath ? 0 : 1);
			const subTree = buildArchyTree(<Base<S, E>>child, childDepth, state);
			if (subTree) {
				nodes.push(subTree);
			}
		}
	}

	return {
		label,
		nodes,
	};
}

export function serializeArchyTree<S extends BlueshellState, E>(
	tree: Base<S, E>, state?: S, contextDepth = Number.MAX_SAFE_INTEGER
): string {
	const archyTree = buildArchyTree(tree, contextDepth, state);
	if (archyTree) {
		return archy(archyTree);
	}
	return '';
}