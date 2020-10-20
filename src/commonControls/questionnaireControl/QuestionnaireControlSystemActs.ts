import { Control, ControlInput, ControlResponseBuilder } from '../..';
import { InitiativeAct } from '../../systemActs/InitiativeActs';
import { AplContent, QuestionnaireUserAnswers } from './QuestionnaireControl';
import { QuestionnaireControlAPLContent } from './QuestionnaireControlBuiltIns';
import { QuestionnaireContent } from './QuestionnaireControlStructs';

export interface PresentQuestionnaireAndAskOneQuestionPayload {
    // business data
    questionnaireContent: QuestionnaireContent;
    currentAnswers: QuestionnaireUserAnswers;
    focusQuestionId: string;

    // pre-rendered representations.. although helpful, perhaps it is too much?
    // renderedQuestions: string[];
    // renderedAnswers: string[];
}

export class AskOneQuestionAct extends InitiativeAct {
    payload: PresentQuestionnaireAndAskOneQuestionPayload;

    constructor(control: Control, payload: PresentQuestionnaireAndAskOneQuestionPayload) {
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
