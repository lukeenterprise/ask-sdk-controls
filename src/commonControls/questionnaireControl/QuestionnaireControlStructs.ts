export interface QuestionnaireContent {
    questionIds: string[];
    answerIds: string[];
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
