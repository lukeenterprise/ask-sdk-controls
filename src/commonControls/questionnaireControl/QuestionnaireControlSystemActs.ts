import { ControlInput, ControlResponseBuilder } from '../..';
import { InitiativeAct } from '../../systemActs/InitiativeActs';

export class ConfirmQuestionnaireAnswer extends InitiativeAct {
    constructor();

    render(input: ControlInput, responseBuilder: ControlResponseBuilder): void {
        throw new Error('Method not implemented.');
    }
}
