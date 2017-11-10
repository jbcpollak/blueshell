/**
 * Created by josh on 1/21/16.
 */
'use strict';

let Decorator = require('../Decorator');

// Swaps one result from the child for another
// You can use this to mask FAILURE, etc
//
// For example, you can use this to have a Sequence continue operation
// when a child returns FAILURE.
class ResultSwap extends Decorator {

	constructor(inResult,
		outResult,
		child,
		name = `ResultSwap_${inResult}-${outResult}-${child.name}`) {
		super(name, child);
		this._inResult = inResult;
		this._outResult = outResult;
	}

	onEvent(state, event) {
		let p = this.child.handleEvent(state, event);

		return p.then(res => {
			if (res === this._inResult) {
				res = this._outResult;
			}

			return res;
		});
	}
}

module.exports = ResultSwap;