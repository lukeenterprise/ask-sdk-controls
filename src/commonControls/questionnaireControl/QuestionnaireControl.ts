/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import { getSupportedInterfaces } from 'ask-sdk-core';
import { IntentRequest } from 'ask-sdk-model';
import i18next from 'i18next';
import _ from 'lodash';
import { Strings as $ } from '../../constants/Strings';
import {
    Control,
    ControlInitiativeHandler,
    ControlInputHandler,
    ControlInputHandlingProps,
    ControlProps,
    ControlState,
} from '../../controls/Control';
import { ControlInput } from '../../controls/ControlInput';
import { ControlResultBuilder } from '../../controls/ControlResult';
import { InteractionModelContributor } from '../../controls/mixins/InteractionModelContributor';
import { ValidationResult } from '../../controls/ValidationResult';
import { GeneralControlIntent, unpackGeneralControlIntent } from '../../intents/GeneralControlIntent';
import { SingleValueControlIntent } from '../../intents/SingleValueControlIntent';
import { ControlInteractionModelGenerator } from '../../interactionModelGeneration/ControlInteractionModelGenerator';
import { ModelData, SharedSlotType } from '../../interactionModelGeneration/ModelTypes';
import { Logger } from '../../logging/Logger';
import { ControlResponseBuilder } from '../../responseGeneration/ControlResponseBuilder';
import { SystemAct } from '../../systemActs/SystemAct';
import { assert } from '../../utils/AssertionUtils';
import { StringOrList } from '../../utils/BasicTypes';
import { DeepRequired } from '../../utils/DeepRequired';
import { InputUtil } from '../../utils/InputUtil';
import { falseIfGuardFailed, okIf } from '../../utils/Predicates';
import { QuestionnaireControlAPLPropsBuiltIns } from './QuestionnaireControlBuiltIns';
import { Question, QuestionnaireContent, RenderedQuestionnaireContent } from './QuestionnaireControlStructs';
import { AskQuestionAct } from './QuestionnaireControlSystemActs';

/**
 * Future feature ideas:
 *  - pre-configured yes/no questionnaireControl
 *  - pre-configured yes/no/maybe questionnaireControl
 */

const log = new Logger('AskSdkControls:QuestionnaireControl');

/**
 * Props for a QuestionnaireControl.
 */
export interface QuestionnaireControlProps extends ControlProps {
    /**
     * Unique identifier for control instance
     */
    id: string;

    /**
     * Content for the questionnaire.
     */
    questionnaireData:
        | QuestionnaireContent
        | ((this: QuestionnaireControl, input: ControlInput) => QuestionnaireContent);

    /**
     * Slot type for the answers.
     *
     * Usage:
     * - The slot type defines the set of expected value items.
     */
    slotType: string;

    /**
     * Determine if the questionnaire is considered 'sufficiently complete'.
     *
     * Default: `true`, i.e. any amount of answers is acceptable.
     *
     * Usage:
     * - Validation functions return either `true` or a `ValidationResult` to
     *   describe what validation failed.
     */
    completion?: QuestionnaireCompleteFunction;

    /**
     * Determines if the Control must obtain a value.
     *
     * If `true`:
     *  - the Control report isReady() = false if no value has been obtained.
     *  - the control will take the initiative when given the opportunity.
     */
    required?: boolean | ((this: QuestionnaireControl, input: ControlInput) => boolean);

    /**
     * Whether the Control has to obtain explicit confirmation of an answer.
     *
     * Default: false
     *
     * If `true`:
     *  - a yes/no question will be asked, e.g. 'was that [answer a]?'.
     */
    answerConfirmationRequired?: boolean | ((this: QuestionnaireControl, input: ControlInput) => boolean);

    /**
     * Map questionId to a prompt fragment.
     *
     * Purpose:
     *  - Many prompts will need to 'render the question' as part of the prompt. This prop
     *    provides a single place to define mapping for use in many prompts.
     *
     * Usage:
     *  - Default prompts make use of this mapping.
     *  - Custom prompts may also refer to this mapping if it is convenient.
     *  - If a common mapping isn't sufficient, each prompt can be overridden individually.
     */
    questionRenderer: (this: QuestionnaireControl, questionId: string, input: ControlInput) => string;

    /**
     * Map choiceId to a prompt fragment.
     *
     * Purpose:
     *  - Many prompts will need to 'render the choice' as part of the prompt. This prop
     *    provides a single place to define mapping for use in many prompts.
     *
     * Usage:
     *  - Default prompts make use of this mapping.
     *  - Custom prompts may also refer to this mapping if it is convenient.
     *  - If a common mapping isn't sufficient, each prompt can be overridden individually.
     */
    choiceRenderer?: (this: QuestionnaireControl, choiceId: string, input: ControlInput) => string;

    /**
     * Props to customize the prompt fragments that will be added by
     * `this.renderAct()`.
     */
    prompts?: QuestionnaireControlPromptProps;

    /**
     * Props to customize the reprompt fragments that will be added by
     * `this.renderAct()`.
     */
    reprompts?: QuestionnaireControlPromptProps;

    /**
     * Props to customize the relationship between the control and the
     * interaction model.
     */
    interactionModel?: QuestionnaireControlInteractionModelProps;

    /**
     * Props to configure input handling.
     */
    inputHandling?: ControlInputHandlingProps;

    /**
     * Props to customize the APL generated by this control.
     */
    apl?: QuestionnaireControlAPLProps;
}

/**
 * Function that determines if a questionnaire is considered "acceptably complete".
 *
 * @returns - true if the questionnaire is acceptably complete. otherwise, an object
 * describing the reason it is not considered complete.
 */
export type QuestionnaireCompleteFunction = (
    this: QuestionnaireControl,
    state: QuestionnaireControlState,
    input: ControlInput,
) => true | ValidationResult;

/**
 * Mapping of action slot values to the behaviors that this control supports.
 *
 * Behavior:
 * - This control will not handle an input if the action-slot is filled with an
 *   value whose ID is not associated with a capability.
 */
export interface QuestionnaireControlActionProps {
    /**
     * Action slot value IDs that are associated with the "set value" capability.
     *
     * Default: ['builtin_set', 'builtin_select']
     */
    set?: string[]; //TODO:review/revise

    /**
     * Action slot value IDs that are associated with the "change value" capability.
     *
     * Default ['builtin_change']
     */
    change?: string[];
}

/**
 * Props associated with the interaction model.
 */
export class QuestionnaireControlInteractionModelProps {
    /**
     * Target-slot values associated with this Control, both the control itself and all
     * possible questions.
     *
     * Targets associate utterances to a control. For example, if the user says
     * "change the time", it is parsed as a `GeneralControlIntent` with slot
     * values `action = change` and `target = time`.  Only controls that are
     * registered with the `time` target should offer to handle this intent.
     *
     * Default: `['builtin_it']`
     *
     * Usage:
     * - If this prop is defined, it replaces the default; it is not additive
     *   the defaults.  To add an additional target to the defaults, copy the
     *   defaults and amend.
     * - A control can be associated with many target-slot-values, eg ['date',
     *   'startDate', 'eventStartDate', 'vacationStart']
     * - It is a good idea to associate with general targets (e.g. date) and
     *   also with specific targets (e.g. vacationStart) so that the user can
     *   say either general or specific things.  e.g. 'change the date to
     *   Tuesday', or 'I want my vacation to start on Tuesday'.
     * - The association does not have to be exclusive, and general target slot
     *   values will often be associated with many controls. In situations where
     *   there is ambiguity about what the user is referring to, the parent
     *   controls must resolve the confusion.
     * - The 'builtin_*' IDs are associated with default interaction model data
     *   (which can be extended as desired). Any other IDs will require a full
     *   definition of the allowed synonyms in the interaction model.
     *
     * Control behavior:
     * - A control will not handle an input that mentions a target that is not
     *   registered by this prop.
     *
     */
    targets?: string[];

    /**
     * Action slot-values associated to the control's capabilities, both the control
     * itself and all possible questions
     *
     * Default:
     * ```
     * {
     *    set: ['builtin_set', 'builtin_select'],
     *    change: ['builtin_set']
     * }
     * ```
     *
     * Action slot-values associate utterances to a control. For example, if the user says
     * "change the time", it is parsed as a `GeneralControlIntent` with slot values
     * `action = change` and `target = time`.  Only controls that are registered with the
     * `change` action should offer to handle this intent.
     *
     * Usage:
     *  - This allows users to refer to an action using more domain-appropriate words. For
     *    example, a user might like to say 'show two items' rather that 'set item count
     *    to two'.  To achieve this, include the slot-value-id 'show' in the list
     *    associated with the 'set' capability and ensure the interaction-model includes
     *    an action slot value with id=show and appropriate synonyms.
     *  - The 'builtin_*' IDs are associated with default interaction model data (which
     *    can be extended as desired). Any other IDs will require a full definition of the
     *    allowed synonyms in the interaction model.
     */
    actions?: QuestionnaireControlActionProps;
}

/**
 * Props to customize the prompt fragments that will be added by
 * `this.renderAct()`.
 */
export class QuestionnaireControlPromptProps {
    askQuestionAct:
        | StringOrList
        | ((this: QuestionnaireControl, act: AskQuestionAct, input: ControlInput) => StringOrList);
    // valueSet?: StringOrList | ((act: ValueSetAct<any>, input: ControlInput) => StringOrList);
    // valueChanged?: StringOrList | ((act: ValueChangedAct<any>, input: ControlInput) => StringOrList);
    // invalidValue?: StringOrList | ((act: InvalidValueAct<any>, input: ControlInput) => StringOrList);
    // unusableInputValue?:
    //     | StringOrList
    //     | ((act: UnusableInputValueAct<string>, input: ControlInput) => StringOrList);
    // requestValue?: StringOrList | ((act: RequestValueByListAct, input: ControlInput) => StringOrList);
    // requestChangedValue?:
    //     | StringOrList
    //     | ((act: RequestChangedValueByListAct, input: ControlInput) => StringOrList);
    // confirmValue?: StringOrList | ((act: ConfirmValueAct<any>, input: ControlInput) => StringOrList);
    // valueConfirmed?: StringOrList | ((act: ValueConfirmedAct<any>, input: ControlInput) => StringOrList);
    // valueDisconfirmed?:
    //     | StringOrList
    //     | ((act: ValueDisconfirmedAct<any>, input: ControlInput) => StringOrList);
}

//Strong types for all the components of props.. makes it possible to type all the utility
//methods correctly.

//Note: we pass control to make it easier for lambda-syntax props (as 'this' isn't wired
//correctly for lambda-style props)
//TODO: replicate this pattern elsewhere.
export type AplContent = { document: any; dataSource: any };
export type AplContentFunc = (control: QuestionnaireControl, input: ControlInput) => AplContent;
export type AplPropNewStyle = AplContent | AplContentFunc;

/**
 * Props associated with the APL produced by QuestionnaireControl.
 */
export class QuestionnaireControlAPLProps {
    /**
     * Determines if APL should be produced.
     *
     * Default: true
     */
    enabled?: boolean | ((input: ControlInput) => boolean);

    askOneQuestionAct: AplPropNewStyle;

    // requestValue?: AplPropNewStyle;
    // requestChangedValue?: AplPropNewStyle;
}

export type QuestionnaireUserAnswers = {
    [index: string]: {
        answerId: string;
        atRiskOfMisunderstanding: boolean;
    };
};

/**
 * State tracked by a QuestionnaireControl.
 */
export class QuestionnaireControlState implements ControlState {
    /**
     * The answers as a map of (questionId, answerId) pairs.
     */
    value: QuestionnaireUserAnswers;

    /**
     * Tracks the most recent initiative action.
     */
    activeInitiative?: {
        actName: string;
        //other things related to the act? but probably should just be tracked as regular
        //state variables.
        //(note that SystemActs are not good state variables.. they are programming model
        //helpers to pass information to render() functions.)
    };

    /**
     * Which questionId is active, aka in focus.
     */
    focusQuestionId?: string;
}

/**
 * A Control that asks a series of questions, where each question has the same
 * answer-options.
 *
 * Capabilities:
 * - Activate the questionnaire. "I'd like to answer the personality questionnaire"
 * - Answer a question directly. "Yes I have headache" // "yes to question three"
 * - Bring a question in to focus. "U: skip to headache" // "U: move to question ten"
 * - Confirm an answer
 * - Show the entire questionnaire on APL enabled devices (with interactivity)
 */
export class QuestionnaireControl extends Control implements InteractionModelContributor {
    state: QuestionnaireControlState = new QuestionnaireControlState();

    private rawProps: QuestionnaireControlProps;
    props: DeepRequired<QuestionnaireControlProps>;

    private handleFunc?: (input: ControlInput, resultBuilder: ControlResultBuilder) => void;
    private initiativeFunc?: (input: ControlInput, resultBuilder: ControlResultBuilder) => void;

    constructor(props: QuestionnaireControlProps) {
        super(props.id);
        this.rawProps = props;
        this.props = QuestionnaireControl.mergeWithDefaultProps(props);
        this.state.value = {};
    }

    /**
     * Merges the user-provided props with the default props.
     *
     * Any property defined by the user-provided data overrides the defaults.
     */
    static mergeWithDefaultProps(props: QuestionnaireControlProps): DeepRequired<QuestionnaireControlProps> {
        const defaults: DeepRequired<QuestionnaireControlProps> = {
            id: 'dummy',
            questionnaireData: {
                questions: [],
                choices: [],
                choiceForYesUtterance: 'dummy',
                choiceForNoUtterance: 'dummy',
            },
            slotType: 'dummy',

            required: true,
            answerConfirmationRequired: false,

            completion: () => {
                return { reasonCode: 'todo' };
            }, //TODO: implement default of allQuestionsAnswered.
            interactionModel: {
                actions: {
                    set: [$.Action.Set, $.Action.Select],
                    change: [$.Action.Change],
                },
                targets: [$.Target.Choice, $.Target.It],
            },
            questionRenderer: (id: string) => id,
            choiceRenderer: (id: string) => id,
            prompts: {
                askQuestionAct: (act) => act.payload.renderedContent.questions[act.payload.questionId],

                // confirmValue: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_PROMPT_CONFIRM_VALUE', { value: act.payload.value }),
                // valueConfirmed: i18next.t('LIST_CONTROL_DEFAULT_PROMPT_VALUE_AFFIRMED'),
                // valueDisconfirmed: i18next.t('LIST_CONTROL_DEFAULT_PROMPT_VALUE_DISAFFIRMED'),
                // valueSet: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_PROMPT_VALUE_SET', { value: act.payload.value }),
                // valueChanged: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_PROMPT_VALUE_CHANGED', { value: act.payload.value }),
                // invalidValue: (act) => {
                //     if (act.payload.renderedReason !== undefined) {
                //         return i18next.t('LIST_CONTROL_DEFAULT_PROMPT_INVALID_VALUE_WITH_REASON', {
                //             value: act.payload.value,
                //             reason: act.payload.renderedReason,
                //         });
                //     }
                //     return i18next.t('LIST_CONTROL_DEFAULT_PROMPT_GENERAL_INVALID_VALUE');
                // },
                // unusableInputValue: (act) => i18next.t('LIST_CONTROL_DEFAULT_PROMPT_UNUSABLE_INPUT_VALUE'),
                // requestValue: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_PROMPT_REQUEST_VALUE', {
                //         suggestions: ListFormatting.format(act.payload.choicesFromActivePage),
                //     }),
                // requestChangedValue: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_PROMPT_REQUEST_CHANGED_VALUE', {
                //         suggestions: ListFormatting.format(act.payload.choicesFromActivePage),
                //     }),
            },
            reprompts: {
                askQuestionAct: (act) => act.payload.renderedContent.questions[act.payload.questionId],
                // confirmValue: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_CONFIRM_VALUE', { value: act.payload.value }),
                // valueConfirmed: i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_VALUE_AFFIRMED'),
                // valueDisconfirmed: i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_VALUE_DISAFFIRMED'),
                // valueSet: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_VALUE_SET', { value: act.payload.value }),
                // valueChanged: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_VALUE_CHANGED', { value: act.payload.value }),
                // invalidValue: (act) => {
                //     if (act.payload.renderedReason !== undefined) {
                //         return i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_INVALID_VALUE_WITH_REASON', {
                //             value: act.payload.value,
                //             reason: act.payload.renderedReason,
                //         });
                //     }
                //     return i18next.t('LIST_CONTROL_DEFAULT_PROMPT_GENERAL_INVALID_VALUE');
                // },
                // unusableInputValue: (act) => i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_UNUSABLE_INPUT_VALUE'),
                // requestValue: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_REQUEST_VALUE', {
                //         suggestions: ListFormatting.format(act.payload.choicesFromActivePage),
                //     }),
                // requestChangedValue: (act) =>
                //     i18next.t('LIST_CONTROL_DEFAULT_REPROMPT_REQUEST_CHANGED_VALUE', {
                //         suggestions: ListFormatting.format(act.payload.choicesFromActivePage),
                //     }),
            },
            apl: QuestionnaireControlAPLPropsBuiltIns.Default,
            inputHandling: {
                customHandlingFuncs: [],
            },
        };

        return _.merge(defaults, props);
    }

    standardInputHandlers: ControlInputHandler[] = [
        {
            name: 'std::DirectAnswer',
            canHandle: this.isPositiveAnswerWithoutValue,
            handle: this.handlePositiveAnswerWithoutValue,
        },
    ];

    // const builtInCanHandle: boolean =
    //     this.isSetWithValue(input) ||
    //     this.isChangeWithValue(input) ||
    //     this.isSetWithoutValue(input) ||
    //     this.isChangeWithoutValue(input) ||
    //     this.isBareValue(input) ||
    //     this.isMappedBareValueDuringElicitation(input) ||
    //     this.isConfirmationAffirmed(input) ||
    //     this.isConfirmationDisaffirmed(input) ||
    //     this.isOrdinalScreenEvent(input) ||
    //     this.isOrdinalSelection(input);

    // logIfBothTrue(customCanHandle, builtInCanHandle);
    // return customCanHandle || builtInCanHandle;

    // tsDoc - see Control
    async canHandle(input: ControlInput): Promise<boolean> {
        const stdHandlers = this.standardInputHandlers;
        const customHandlers = this.props.inputHandling.customHandlingFuncs ?? [];

        let matches = [];
        for (const handler of stdHandlers.concat(customHandlers)) {
            if (await handler.canHandle.call(this, input)) {
                matches.push(handler);
            }
        }

        if (matches.length > 1) {
            log.error(
                `More than one handler matched. Handlers in a single control should be mutually exclusive. ` +
                    `Defaulting to the first. handlers: ${JSON.stringify(matches.map((x) => x.name))}`,
            );
        }

        if (matches.length >= 1) {
            this.handleFunc = matches[0].handle.bind(this);
            return true;
        } else {
            return false;
        }
    }

    // tsDoc - see Control
    async handle(input: ControlInput, resultBuilder: ControlResultBuilder): Promise<void> {
        if (this.handleFunc === undefined) {
            log.error(
                'QuestionnaireControl: handle called but this.handlerFunc not set.  are canHandle/handle out of sync?',
            );
            throw new Error(`this.handlerFunc not set.  are canHandle/handle out of sync?`);
        }

        await this.handleFunc(input, resultBuilder);
        if (resultBuilder.hasInitiativeAct() !== true && (await this.canTakeInitiative(input)) === true) {
            await this.takeInitiative(input, resultBuilder);
        }
    }

    private isPositiveAnswerWithoutValue(input: ControlInput): boolean {
        try {
            okIf(this.state.focusQuestionId !== undefined);
            const question = this.getQuestionContentById(this.state.focusQuestionId, input);

            okIf(InputUtil.isIntent(input, GeneralControlIntent.name));
            const { feedback, action, target } = unpackGeneralControlIntent(
                (input.request as IntentRequest).intent,
            );
            okIf(feedback !== undefined || action !== undefined || target !== undefined); //sanity check that something is defined.
            okIf(InputUtil.feedbackIsMatchOrUndefined(feedback, [$.Feedback.Affirm]));
            okIf(InputUtil.actionIsMatchOrUndefined(action, question.actions));
            okIf(InputUtil.targetIsMatchOrUndefined(target, question.targets));

            return true;
        } catch (e) {
            return falseIfGuardFailed(e);
        }
    }

    private handlePositiveAnswerWithoutValue(input: ControlInput, resultBuilder: ControlResultBuilder) {
        const content = this.getQuestionnaireContent(input);
        const question = this.getQuestionContentById(this.state.focusQuestionId!, input);
        const positiveAnswer = content.choiceForYesUtterance ?? content.choices[0];

        this.updateAnswer(question.id, positiveAnswer, input, resultBuilder);
        return;
    }

    standardInitiativeHandlers: ControlInitiativeHandler[] = [
        {
            name: 'std::askLineItem',
            canTakeInitiative: this.wantsToAskLineItemQuestion,
            takeInitiative: this.askLineItemQuestion,
        },
    ];

    // tsDoc - see Control
    async canTakeInitiative(input: ControlInput): Promise<boolean> {
        const stdHandlers = this.standardInitiativeHandlers;

        let matches = [];
        for (const handler of stdHandlers) {
            if (await handler.canTakeInitiative.call(this, input)) {
                matches.push(handler);
            }
        }

        if (matches.length > 1) {
            log.error(
                `More than one handler matched. Handlers in a single control should be mutually exclusive. ` +
                    `Defaulting to the first. handlers: ${JSON.stringify(matches.map((x) => x.name))}`,
            );
        }

        if (matches.length >= 1) {
            this.initiativeFunc = matches[0].takeInitiative.bind(this);
            return true;
        } else {
            return false;
        }
    }

    // public canTakeInitiative(input: ControlInput): boolean {
    //     // return (
    //     //     this.wantsToConfirmValue(input) ||
    //     //     this.wantsToFixInvalidValue(input) ||
    //     //     this.wantsToElicitValue(input)
    //     // );
    // }

    // tsDoc - see Control
    public async takeInitiative(input: ControlInput, resultBuilder: ControlResultBuilder): Promise<void> {
        if (this.initiativeFunc === undefined) {
            const errorMsg =
                'QuestionnaireControl: takeInitiative called but this.initiativeFunc is not set. canTakeInitiative() should be called first to set this.initiativeFunc.';
            log.error(errorMsg);
            throw new Error(errorMsg);
        }
        this.initiativeFunc(input, resultBuilder);
        return;
    }

    // private wantsToConfirmValue(input: ControlInput): boolean {
    //     if (
    //         this.state.value !== undefined &&
    //         this.state.isValueConfirmed === false &&
    //         this.evaluateBooleanProp(this.props.confirmationRequired, input)
    //     ) {
    //         this.initiativeFunc = this.confirmValue;
    //         return true;
    //     }
    //     return false;
    // }

    // private confirmValue(input: ControlInput, resultBuilder: ControlResultBuilder): void {
    //     this.addInitiativeAct(new ConfirmValueAct(this, { value: this.state.value }), resultBuilder);
    // }

    // private wantsToFixInvalidValue(input: ControlInput): boolean {
    //     if (this.state.value !== undefined && this.validate(input) !== true) {
    //         this.initiativeFunc = this.fixInvalidValue;
    //         return true;
    //     }
    //     return false;
    // }

    // private fixInvalidValue(input: ControlInput, resultBuilder: ControlResultBuilder): void {
    //     this.validateAndAddActs(input, resultBuilder, $.Action.Change);
    // }

    private wantsToAskLineItemQuestion(input: ControlInput): boolean {
        // if we haven't started and required=false, then don't start.
        if (this.state.value === {} && this.evaluateBooleanProp(this.props.required, input) === false) {
            return false;
        }

        //TODO: evaluate completion prop.
        return true;
    }

    private askLineItemQuestion(input: ControlInput, resultBuilder: ControlResultBuilder): void {
        const content = this.getQuestionnaireContent(input);
        const renderedContent = this.getRenderedQuestionnaireContent(input);
        this.state.focusQuestionId = content.questions[0].id;
        
        const renderedQuestion = this.props.questionRenderer.call(this, this.state.focusQuestionId, input);

        const initiativeAct = new AskQuestionAct(this, {
            questionnaireContent: content,
            renderedContent,
            answers: this.state.value,
            questionId: this.state.focusQuestionId,            
        });
        this.state.activeInitiative = { actName: initiativeAct.constructor.name };
        resultBuilder.addAct(initiativeAct);
    }

    // validateAndAddActs(
    //     input: ControlInput,
    //     resultBuilder: ControlResultBuilder,
    //     elicitationAction: string,
    // ): void {
    //     const validationResult: true | ValidationResult = this.validate(input);
    //     if (validationResult === true) {
    //         if (elicitationAction === $.Action.Change) {
    //             // if elicitationAction == 'change', then the previousValue must be defined.
    //             if (this.state.previousValue !== undefined) {
    //                 resultBuilder.addAct(
    //                     new ValueChangedAct<string>(this, {
    //                         previousValue: this.state.previousValue,
    //                         value: this.state.value!,
    //                     }),
    //                 );
    //             } else {
    //                 throw new Error(
    //                     'ValueChangedAct should only be used if there is an actual previous value',
    //                 );
    //             }
    //         } else {
    //             resultBuilder.addAct(new ValueSetAct(this, { value: this.state.value }));
    //         }
    //     } else {
    //         // feedback
    //         resultBuilder.addAct(
    //             new InvalidValueAct<string>(this, {
    //                 value: this.state.value!,
    //                 reasonCode: validationResult.reasonCode,
    //                 renderedReason: validationResult.renderedReason,
    //             }),
    //         );
    //         this.askElicitationQuestion(input, resultBuilder, elicitationAction);
    //     }
    //     return;
    // }

    // private validate(input: ControlInput): true | ValidationResult {
    //     const listOfValidationFunc: QuestionnaireCompleteFunction[] =
    //         typeof this.props.validation === 'function' ? [this.props.validation] : this.props.validation;
    //     for (const validationFunction of listOfValidationFunc) {
    //         const validationResult: true | ValidationResult = validationFunction(this.state, input);
    //         if (validationResult !== true) {
    //             log.debug(
    //                 `QuestionnaireControl.validate(): validation failed. Reason: ${JSON.stringify(
    //                     validationResult,
    //                     null,
    //                     2,
    //                 )}.`,
    //             );
    //             return validationResult;
    //         }
    //     }
    //     return true;
    // }

    /**
     * Evaluate the questionnaireContent prop
     */
    public getQuestionnaireContent(input: ControlInput): DeepRequired<QuestionnaireContent> {
        const propValue = this.props.questionnaireData;
        return typeof propValue === 'function' ? (propValue as any).call(this, input) : propValue;
    }

    public getRenderedQuestionnaireContent(input: ControlInput): RenderedQuestionnaireContent {
        const content = this.getQuestionnaireContent(input);
        
        
        const renderedQuestions = _.fromPairs(content.questions.map(question=>[question.id, question]));
        const renderedChoices = _.fromPairs(content.choices.map(choice=>[choice.id, choice]));


        return {
            questions: renderedQuestions,
            choices: renderedChoices
        }
    }

    private evaluateAPLPropNewStyle(prop: AplPropNewStyle, input: ControlInput): AplContent {
        return typeof prop === 'function' ? (prop as AplContentFunc).call(this, this, input) : prop;
    }

    // private askElicitationQuestion(input: ControlInput, resultBuilder: ControlResultBuilder) {
    //     const content = this.getQuestionnaireContent(input);
    //     if (content === null) {
    //         throw new Error('QuestionnaireControl.questionnaireContent is null');
    //     }

    //     const initiativeAct = new AskQuestionAct(this, {
    //         questionnaireContent: content,
    //         answers: this.state.value,
    //         questionId: 'cough',
    //         renderedQuestion
    //     });
    //     resultBuilder.addAct(initiativeAct);

    //     this.state.activeInitiative = { actName: initiativeAct.constructor.name };
    //     return;
    // }

    // addInitiativeAct(initiativeAct: InitiativeAct, resultBuilder: ControlResultBuilder) {
    //     this.state.activeInitiativeActName = initiativeAct.constructor.name;
    //     resultBuilder.addAct(initiativeAct);
    // }

    // tsDoc - see ControlStateDiagramming
    public stringifyStateForDiagram(): string {
        let text = ''; // TODO:Maybe: some representation of the answers?
        if (this.state.activeInitiative !== undefined) {
            text += `[${this.state.activeInitiative.actName}]`;
        }
        return text;
    }

    // private getChoicesList(input: ControlInput): string[] {
    //     const slotIds: string[] =
    //         typeof this.props.listItemIDs === 'function'
    //             ? this.props.listItemIDs.call(this, input)
    //             : this.props.listItemIDs;
    //     return slotIds;
    // }

    // private getChoicesFromActivePage(allChoices: string[]): string[] {
    //     const start = this.getPageIndex();
    //     const end = start + this.props.pageSize;
    //     return allChoices.slice(start, end);
    // }

    // private getPageIndex(): number {
    //     if (this.state.spokenItemsPageIndex === undefined) {
    //         this.state.spokenItemsPageIndex = 0;
    //     }
    //     return this.state.spokenItemsPageIndex;
    // }

    // tsDoc - see Control
    public renderAct(act: SystemAct, input: ControlInput, builder: ControlResponseBuilder): void {
        if (act instanceof AskQuestionAct) {
            // const prompt = this.evaluatePromptProp(act, this.props.prompts.requestValue, input);
            // const reprompt = this.evaluatePromptProp(act, this.props.reprompts.requestValue, input);

            const prompt = 'hi';
            const reprompt = 'hi';

            builder.addPromptFragment(this.evaluatePromptProp(act, prompt, input));
            builder.addRepromptFragment(this.evaluatePromptProp(act, reprompt, input));

            if (
                this.evaluateBooleanProp(this.props.apl.enabled, input) === true &&
                getSupportedInterfaces(input.handlerInput.requestEnvelope)['Alexa.Presentation.APL']
            ) {
                const renderedAPL = this.evaluateAPLPropNewStyle(this.props.apl.askOneQuestionAct, input);
                builder.addAPLRenderDocumentDirective(this.id, renderedAPL.document, renderedAPL.dataSource);
            }
        }
        // } else if (act instanceof RequestChangedValueByListAct) {
        //     const prompt = this.evaluatePromptProp(act, this.props.prompts.requestChangedValue, input);
        //     const reprompt = this.evaluatePromptProp(act, this.props.reprompts.requestChangedValue, input);

        //     builder.addPromptFragment(this.evaluatePromptProp(act, prompt, input));
        //     builder.addRepromptFragment(this.evaluatePromptProp(act, reprompt, input));

        //     if (
        //         this.evaluateBooleanProp(this.props.apl.enabled, input) === true &&
        //         getSupportedInterfaces(input.handlerInput.requestEnvelope)['Alexa.Presentation.APL']
        //     ) {
        //         const document = this.evaluateAPLProp(act, this.props.apl.requestChangedValue.document);
        //         const dataSource = this.evaluateAPLProp(act, this.props.apl.requestChangedValue.dataSource);
        //         builder.addAPLRenderDocumentDirective('Token', document, dataSource);
        //     }
        // } else if (act instanceof UnusableInputValueAct) {
        //     builder.addPromptFragment(
        //         this.evaluatePromptProp(act, this.props.prompts.unusableInputValue, input),
        //     );
        //     builder.addRepromptFragment(
        //         this.evaluatePromptProp(act, this.props.reprompts.unusableInputValue, input),
        //     );
        // } else if (act instanceof InvalidValueAct) {
        //     builder.addPromptFragment(this.evaluatePromptProp(act, this.props.prompts.invalidValue, input));
        //     builder.addRepromptFragment(
        //         this.evaluatePromptProp(act, this.props.reprompts.invalidValue, input),
        //     );
        // } else if (act instanceof ValueSetAct) {
        //     builder.addPromptFragment(this.evaluatePromptProp(act, this.props.prompts.valueSet, input));
        //     builder.addRepromptFragment(this.evaluatePromptProp(act, this.props.reprompts.valueSet, input));
        // } else if (act instanceof ValueChangedAct) {
        //     builder.addPromptFragment(this.evaluatePromptProp(act, this.props.prompts.valueChanged, input));
        //     builder.addRepromptFragment(
        //         this.evaluatePromptProp(act, this.props.reprompts.valueChanged, input),
        //     );
        // } else if (act instanceof ConfirmValueAct) {
        //     builder.addPromptFragment(this.evaluatePromptProp(act, this.props.prompts.confirmValue, input));
        //     builder.addRepromptFragment(
        //         this.evaluatePromptProp(act, this.props.reprompts.confirmValue, input),
        //     );
        // } else if (act instanceof ValueConfirmedAct) {
        //     builder.addPromptFragment(this.evaluatePromptProp(act, this.props.prompts.valueConfirmed, input));
        //     builder.addRepromptFragment(
        //         this.evaluatePromptProp(act, this.props.reprompts.valueConfirmed, input),
        //     );
        // } else if (act instanceof ValueDisconfirmedAct) {
        //     builder.addPromptFragment(
        //         this.evaluatePromptProp(act, this.props.prompts.valueDisconfirmed, input),
        //     );
        //     builder.addRepromptFragment(
        //         this.evaluatePromptProp(act, this.props.reprompts.valueDisconfirmed, input),
        //     );
        //}
        else {
            this.throwUnhandledActError(act);
        }
    }

    // tsDoc - see Control
    public updateInteractionModel(generator: ControlInteractionModelGenerator, imData: ModelData) {
        generator.addControlIntent(new GeneralControlIntent(), imData);
        generator.addControlIntent(
            new SingleValueControlIntent(
                this.props.slotType,
                //this.props.interactionModel.slotValueConflictExtensions.filteredSlotType, //TODO.
            ),
            imData,
        );
        //generator.addControlIntent(new OrdinalControlIntent(), imData);
        generator.addYesAndNoIntents();
        if (this.props.interactionModel.targets.includes($.Target.Choice)) {
            generator.addValuesToSlotType(
                SharedSlotType.TARGET,
                i18next.t('QUESTIONNAIRE_CONTROL_DEFAULT_SLOT_VALUES_TARGET_CHOICE', { returnObjects: true }),
            );
        }
        if (this.props.interactionModel.actions.set.includes($.Action.Select)) {
            generator.addValuesToSlotType(
                SharedSlotType.ACTION,
                i18next.t('QUESTIONNAIRE_CONTROL_DEFAULT_SLOT_VALUES_ACTION_SELECT', { returnObjects: true }),
            );
        }

        //todo: add actions for all questions.
    }

    /**
     * Clear the state of this control.
     */
    public clear() {
        this.state = new QuestionnaireControlState();
        this.state.value = {};
    }

    //TODO: actions should also be updated automatically as for targets.

    // tsDoc - see InteractionModelContributor
    public getTargetIds() {
        return this.props.interactionModel.targets;
    }

    public async updateAnswer(
        questionId: string,
        answer: string,
        input: ControlInput,
        resultBuilder: ControlResultBuilder,
    ): Promise<void> {
        this.state.value[questionId] = { answerId: answer, atRiskOfMisunderstanding: false };
    }

    public getQuestionContentById(questionId: string, input: ControlInput): DeepRequired<Question> {
        const questionnaireContent = this.getQuestionnaireContent(input);
        const questions = questionnaireContent.questions;
        const question = questions.find((x) => x.id === questionId);

        assert(question !== undefined, `Question not found. id=${questionId}`);
        return question;
    }

    public getChoiceIndexById(content: QuestionnaireContent, answerId: string): number {
        const idx = content.choices.findIndex((choice) => choice.id === answerId);
        assert(idx >= 0, `Not found. answerId=${answerId}`);
        return idx;
    }
}
