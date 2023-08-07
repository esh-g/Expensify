import React, {useState, useCallback, useRef, useImperativeHandle} from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import CONST from '../../../../CONST';
import useArrowKeyFocusManager from '../../../../hooks/useArrowKeyFocusManager';
import MentionSuggestions from '../../../../components/MentionSuggestions';
import * as UserUtils from '../../../../libs/UserUtils';
import * as Expensicons from '../../../../components/Icon/Expensicons';

/**
 * Check if this piece of string looks like an emoji
 * @param {String} str
 * @param {Number} pos
 * @returns {Boolean}
 */
const isEmojiCode = (str, pos) => {
    const leftWords = str.slice(0, pos).split(CONST.REGEX.SPECIAL_CHAR_OR_EMOJI);
    const leftWord = _.last(leftWords);
    return CONST.REGEX.HAS_COLON_ONLY_AT_THE_BEGINNING.test(leftWord) && leftWord.length > 2;
};

function SuggestionEmoji() {
    const isEmojiSuggestionsMenuVisible = !_.isEmpty(suggestionValues.suggestedEmojis) && suggestionValues.shouldShowEmojiSuggestionMenu;

    const [highlightedEmojiIndex] = useArrowKeyFocusManager({
        isActive: isEmojiSuggestionsMenuVisible,
        maxIndex: getMaxArrowIndex(suggestionValues.suggestedEmojis.length, suggestionValues.isAutoSuggestionPickerLarge),
        shouldExcludeTextAreaNodes: false,
    });

    /**
     * Replace the code of emoji and update selection
     * @param {Number} selectedEmoji
     */
    const insertSelectedEmoji = useCallback(
        (selectedEmoji) => {
            const commentBeforeColon = value.slice(0, suggestionValues.colonIndex);
            const emojiObject = suggestionValues.suggestedEmojis[selectedEmoji];
            const emojiCode = emojiObject.types && emojiObject.types[preferredSkinTone] ? emojiObject.types[preferredSkinTone] : emojiObject.code;
            const commentAfterColonWithEmojiNameRemoved = value.slice(selection.end);

            updateComment(`${commentBeforeColon}${emojiCode} ${trimLeadingSpace(commentAfterColonWithEmojiNameRemoved)}`, true);

            // In some Android phones keyboard, the text to search for the emoji is not cleared
            // will be added after the user starts typing again on the keyboard. This package is
            // a workaround to reset the keyboard natively.
            resetKeyboardInput();

            setSelection({
                start: suggestionValues.colonIndex + emojiCode.length + CONST.SPACE_LENGTH,
                end: suggestionValues.colonIndex + emojiCode.length + CONST.SPACE_LENGTH,
            });
            setSuggestionValues((prevState) => ({...prevState, suggestedEmojis: []}));

            onInsertedEmoji(emojiObject);
        },
        [onInsertedEmoji, preferredSkinTone, resetKeyboardInput, selection.end, setSelection, suggestionValues.colonIndex, suggestionValues.suggestedEmojis, updateComment, value],
    );

    /**
     * Listens for keyboard shortcuts and applies the action
     *
     * @param {Object} e
     */
    const triggerHotkeyActions = useCallback(
        (e) => {
            const suggestionsExist = suggestionValues.suggestedEmojis.length > 0;

            if (((!e.shiftKey && e.key === CONST.KEYBOARD_SHORTCUTS.ENTER.shortcutKey) || e.key === CONST.KEYBOARD_SHORTCUTS.TAB.shortcutKey) && suggestionsExist) {
                e.preventDefault();
                if (suggestionValues.suggestedEmojis.length > 0) {
                    insertSelectedEmoji(highlightedEmojiIndex);
                }
                return true;
            }

            if (e.key === CONST.KEYBOARD_SHORTCUTS.ESCAPE.shortcutKey) {
                e.preventDefault();

                if (suggestionsExist) {
                    resetSuggestions();
                }

                return true;
            }
        },
        [
            highlightedEmojiIndex,
            highlightedMentionIndex,
            insertSelectedEmoji,
            insertSelectedMention,
            resetSuggestions,
            suggestionValues.suggestedEmojis.length,
            suggestionValues.suggestedMentions.length,
        ],
    );

    /**
     * Calculates and cares about the content of an Emoji Suggester
     */
    const calculateEmojiSuggestion = useCallback(
        (selectionEnd) => {
            if (shouldBlockEmojiCalc.current) {
                shouldBlockEmojiCalc.current = false;
                return;
            }
            const leftString = value.substring(0, selectionEnd);
            const colonIndex = leftString.lastIndexOf(':');
            const isCurrentlyShowingEmojiSuggestion = isEmojiCode(value, selectionEnd);

            // the larger composerHeight the less space for EmojiPicker, Pixel 2 has pretty small screen and this value equal 5.3
            const hasEnoughSpaceForLargeSuggestion = windowHeight / composerHeight >= 6.8;
            const isAutoSuggestionPickerLarge = !isSmallScreenWidth || (isSmallScreenWidth && hasEnoughSpaceForLargeSuggestion);

            const nextState = {
                suggestedEmojis: [],
                colonIndex,
                shouldShowEmojiSuggestionMenu: false,
                isAutoSuggestionPickerLarge,
            };
            const newSuggestedEmojis = EmojiUtils.suggestEmojis(leftString, preferredLocale);

            if (newSuggestedEmojis.length && isCurrentlyShowingEmojiSuggestion) {
                nextState.suggestedEmojis = newSuggestedEmojis;
                nextState.shouldShowEmojiSuggestionMenu = !_.isEmpty(newSuggestedEmojis);
            }

            setSuggestionValues((prevState) => ({...prevState, ...nextState}));
        },
        [value, windowHeight, composerHeight, isSmallScreenWidth, preferredLocale],
    );

    const onSelectionChange = useCallback(
        (e) => {
            if (!value || e.nativeEvent.selection.end < 1) {
                resetSuggestions();
                shouldBlockEmojiCalc.current = false;
                shouldBlockMentionCalc.current = false;
                return true;
            }

            /**
             * we pass here e.nativeEvent.selection.end directly to calculateEmojiSuggestion
             * because in other case calculateEmojiSuggestion will have an old calculation value
             * of suggestion instead of current one
             */
            calculateEmojiSuggestion(e.nativeEvent.selection.end);
            calculateMentionSuggestion(e.nativeEvent.selection.end);
        },
        [calculateEmojiSuggestion, calculateMentionSuggestion, resetSuggestions, value],
    );

    if (!isEmojiSuggestionsMenuVisible) {
        return null;
    }

    return (
        <EmojiSuggestions
            onClose={() => setSuggestionValues((prevState) => ({...prevState, suggestedEmojis: []}))}
            highlightedEmojiIndex={highlightedEmojiIndex}
            emojis={suggestionValues.suggestedEmojis}
            comment={value}
            updateComment={(newComment) => setValue(newComment)}
            colonIndex={suggestionValues.colonIndex}
            prefix={value.slice(suggestionValues.colonIndex + 1, selection.start)}
            onSelect={insertSelectedEmoji}
            isComposerFullSize={isComposerFullSize}
            preferredSkinToneIndex={preferredSkinTone}
            isEmojiPickerLarge={suggestionValues.isAutoSuggestionPickerLarge}
            composerHeight={composerHeight}
            shouldIncludeReportRecipientLocalTimeHeight={shouldShowReportRecipientLocalTime}
        />
    );
}

const SuggestionEmojiWithRef = React.forwardRef((props, ref) => (
    <SuggestionEmoji
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
        forwardedRef={ref}
    />
));

export default SuggestionEmojiWithRef;
