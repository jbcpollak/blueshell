/**
 * Created by jpollak on 3/23/16.
 */
'use strict';

let archy = require('archy');

function buildArchyTree(node, state) {

	let nodeLabel = node.name;

	if (nodeLabel !== node.constructor.name) {
		nodeLabel += ' (' + node.constructor.name + ')';
	}

	if (state) {
		let eventCounter = node.getTreeEventCounter(state);
		let lastEventSeen = node.getLastEventSeen(state);
		let lastResult = node.getLastResult(state);

		if (lastEventSeen === eventCounter && lastResult) {
			nodeLabel += ' => ' + lastResult;
		}

	}

	let archyTree = {
		label: nodeLabel,
		nodes: []
	};

	if (node.children) {
		for (let child of node.children) {
			archyTree.nodes.push(buildArchyTree(child, state));
		}
	}

	return archyTree;
}

function renderTree(tree, state) {
	let a = buildArchyTree(tree, state);
	let renderedTree = archy(a);

	return renderedTree;
}

function toConsole(tree, state) {
	console.log(renderTree(tree, state)); // eslint-disable-line no-console
}

renderTree.toConsole = toConsole;

module.exports = renderTree;