import { Control, ControlInput, ControlResponseBuilder } from '../..';
import { InitiativeAct } from '../../systemActs/InitiativeActs';
import { QuestionnaireUserAnswers } from './QuestionnaireControl';
import { QuestionnaireContent, RenderedQuestionnaireContent } from './QuestionnaireControlStructs';

export interface AskQuestionPayload {
    // business data
    questionnaireContent: QuestionnaireContent;
    answers: QuestionnaireUserAnswers;
    questionId: string;

    // pre-rendered representations.
    renderedContent: RenderedQuestionnaireContent;    
}

export class AskQuestionAct extends InitiativeAct {
    payload: AskQuestionPayload;

    constructor(control: Control, payload: AskQuestionPayload) {
        super(control);
        this.payload = payload;
    }

    render(input: ControlInput, responseBuilder: ControlResponseBuilder): void {
        throw new Error('Method not implemented. see QuestionnaireControl for rendering logic.');
    }
}

export class ConfirmQuestionnaireAnswer extends InitiativeAct {
    constructor(control: Control) {
        super(control);
    }

    render(input: ControlInput, responseBuilder: ControlResponseBuilder): void {
        throw new Error('Method not implemented.');
    }
}
