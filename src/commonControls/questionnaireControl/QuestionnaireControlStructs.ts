import { ControlInput } from '../../controls/ControlInput';
import { ControlResultBuilder } from '../../controls/ControlResult';
import { QuestionnaireControl } from './QuestionnaireControl';
import { AskOneQuestionAct } from './QuestionnaireControlSystemActs';


export interface Handler {
    name: string
    canHandle: (input: ControlInput) => boolean
    handle: (input: ControlInput, resultBuilder: ControlResultBuilder) => void
}


export interface Item {
    /**
     * Identifier
     */
    id: string;

    /**
     * rendered form.. perhaps should be split into prompt/apl forms.
     */
    text?: string;
}

export interface QuestionnaireContent {
    /**
     * Questions that form the questionnaire.
     */
    questions: Item[];

    /**
     * Choices that the user can choose from.
     *
     * The possible answers must be the same for all questions.
     */
    choices: Item[];
}

/**
 * Indicates the user's answer to a question and whether there is a perceived risk of misunderstanding.
 */
export class QuestionnaireLineItemAnswer {
    questionId: string;
    answerId: string;
    atRiskOfMisunderstanding: boolean;

    constructor(questionId: string, answerId: string, atRiskOfMisunderstanding: boolean) {
        this.questionId = questionId;
        this.answerId = answerId;
        this.atRiskOfMisunderstanding = atRiskOfMisunderstanding;
    }
}
