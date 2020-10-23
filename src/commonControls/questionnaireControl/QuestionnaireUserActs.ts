import { ControlInput } from '../../controls/ControlInput';
import { ControlResultBuilder } from '../../controls/ControlResult';
import { QuestionnaireControl } from './QuestionnaireControl';
import { QuestionnaireLineItemAnswer } from './QuestionnaireControlStructs';

// export interface UserAct {
//     // process(
//     //     control: QuestionnaireControl,
//     //     input: ControlInput,
//     //     resultBuilder: ControlResultBuilder,
//     // ): void | Promise<void>;
// }

// /**
//  * The user has directly answered a question.
//  * My answer to [question_a] is [answer_b]
//  */
// export class DirectAnswerAct implements UserAct {
    

//     constructor(questionId: string, answer: QuestionnaireLineItemAnswer) {
//         this.questionId = questionId;
//         this.answer = answer;
//     }

//     async process(control: QuestionnaireControl, input: ControlInput, resultBuilder: ControlResultBuilder) {
//         await control.updateAnswer(this, input, resultBuilder);
//         return;
//     }
// }

// /**
//  * The user has confirmed an answer.
//  *
//  * Example utterance:
//  * `U: Yes, my answer to [question_a] is [answer_b]`
//  */
// export class ConfirmAnswerAct implements UserAct {
//     questionId: string;
//     answerId: string;
// }

// /**
//  * The user has disconfirmed an answer.
//  *
//  * Optionally, user provides a correction to either the question, the answer, or both.
//  *
//  * * Example utterances:
//  *   - `U: No, my answer to [question_a] is not [answer_b].`
//  *   - `A: so you didn't enjoy the wine? -> U: No, I did not enjoy the dessert.` |  U: No, I did enjoy the wine.`
//  */
// export class DisconfirmAnswerAct implements UserAct {
//     disconfirmedQuestionId: string;
//     disconfirmedAnswerId: string;
//     correctedQuestionId?: string;
//     correctedAnswerId?: string;
// }

// /**
//  * The user is attempting to 'be done'.
//  *
//  * Example utterances:
//  * U: I've answered everything I can.
//  */
// export class TryCompleteAct implements UserAct {
//     questionId: string;
//     answerId: string;
// }

// /**
//  * The user confirms they 'are done'.
//  *
//  * Example utterances:
//  * U: Yes I'm all done
//  */
// export class ConfirmCompleteAct implements UserAct {
//     questionId: string;
//     answerId: string;
// }

// /**
//  * The user indicates they 'are not done'.
//  *
//  * Example utterances:
//  * U: No I need to answer a few more
//  */
// export class DisconfirmCompleteAct implements UserAct {
//     questionId: string;
//     answerId: string;
// }
