import {ResultCode, BlueshellState, BaseNode, rc, Conditional, NodeStorage} from '../../models';
import {Action} from '../Base';
import {Decorator} from '../Decorator';
import {clearEventSeenRecursive} from '../Parent';

interface WhileNodeStorage extends NodeStorage {
	ranAtLeastOnce?: boolean;
	lastLoopResult?: ResultCode,
	break?: boolean,
}

/**
 * Given a conditional, have the child Node handle an event given a while condition
 * 11/9/21
 * @author Timothy Deignan
 */
export class While<S extends BlueshellState, E> extends Decorator<S, E> {
	constructor(
		desc: string,
		private conditional: Conditional<S, E>,
		child: BaseNode<S, E>,
		private readonly defaultResult: ResultCode = rc.SUCCESS,
	) {
		super('While-' + desc, child);
	}

	protected decorateCall(handleEvent: (state: S, event: E) => ResultCode, state: S, event: E) {
		const storage: WhileNodeStorage = this.getNodeStorage(state);

		if (storage.running || this.conditional(state, event)) {
			if (storage.ranAtLeastOnce) {
				Action.treePublisher.publishResult(state, event, false);
				clearEventSeenRecursive(this.child, state);
			}
			storage.ranAtLeastOnce = true;
			return handleEvent(state, event);
		} else {
			storage.break = true;
			return storage.lastLoopResult || this.defaultResult;
		}
	}

	protected _afterEvent(res: ResultCode, state: S, event: E): ResultCode {
		res = super._afterEvent(res, state, event);

		const storage: WhileNodeStorage = this.getNodeStorage(state);

		if (res === rc.RUNNING) {
			// yield to the behavior tree because the child node is running
			return res;
		} else if (storage.break) {
			// teardown internal state and yield to the behavior tree because the loop has completed
			if (storage.lastLoopResult) {
				// Parent will see one additional event than the child when it evaluates the conditional
				// and breaks out of the loop. We still want that child's lastResult to be shown in btv
				// though, so we must pretend that it saw the last event.
				// FIXME: this should be recursive for the last child of every descendant
				this.child.getNodeStorage(state).lastEventSeen = storage.lastEventSeen;
			}
			storage.ranAtLeastOnce = undefined;
			storage.lastLoopResult = undefined;
			storage.break = undefined;
			return res;
		} else {
			// begin another iteration of the loop
			storage.lastLoopResult = res;
			return this.handleEvent(state, event);
		}
	}

	get symbol(): string {
		return '↻';
	}
}
