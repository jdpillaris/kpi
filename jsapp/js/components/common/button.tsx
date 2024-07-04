import React from 'react';
import type {IconName} from 'jsapp/fonts/k-icons';
import type {IconSize} from 'js/components/common/icon';
import Icon from 'js/components/common/icon';
import './button.scss';
import type {TooltipAlignment} from './tooltip';
import Tooltip from './tooltip';
import {useId} from 'js/hooks/useId.hook';
import cx from 'classnames';

/**
 * Note: we use a simple TypeScript types here instead of enums, so we don't
 * need to import them, just pass correct strings.
 */

/**
 * Button types are:
 * 1. bare - no border, no background, hover sets background
 * 2. frame - border, no background, hover sets background
 * 3. full - no border, background, hover dims background
 */
export type ButtonType = 'bare' | 'frame' | 'full';
export type ButtonColor =
  | 'blue'
  | 'light-blue'
  | 'dark-red'
  | 'dark-blue';

/**
 * The size is the height of the button, but it also influences the paddings.
 * Check out `button.scss` file for exact pixel values.
 */
export type ButtonSize = 'l' | 'm' | 's';

/** To be used for buttons with both icon and text. */
export const ButtonToIconMap: Map<ButtonSize, IconSize> = new Map();
ButtonToIconMap.set('s', 'xs');
ButtonToIconMap.set('m', 's');
ButtonToIconMap.set('l', 'm');

/** To be used for icon-only buttons. */
const ButtonToIconAloneMap: Map<ButtonSize, IconSize> = new Map();
ButtonToIconAloneMap.set('s', 'm');
ButtonToIconAloneMap.set('m', 'l');
ButtonToIconAloneMap.set('l', 'l');

export interface ButtonProps {
  type: ButtonType;
  color: ButtonColor;
  /** Note: this size will also be carried over to the icon. */
  size: ButtonSize;
  /**
   * Setting this displays an icon - either before or after label. Please use
   * only one of the icons.
   */
  startIcon?: IconName;
  endIcon?: IconName;
  /** Label is optional, as sometimes we want an icon-only button. */
  label?: React.ReactNode;
  /**
   * Setting this will make a tooltip appear when hovering over button. Useful
   * for icon-only buttons.
   */
  tooltip?: string;
  /** Sets the alignment of the tooltip */
  tooltipPosition?: TooltipAlignment;
  isDisabled?: boolean;
  /** Changes the appearance to display spinner. */
  isPending?: boolean;
  /** Sets the button HTML type to "submit". */
  isSubmit?: boolean;
  /** Simply changes the width. */
  isFullWidth?: boolean;
  /**
   * Forces the label text to be uppercase. This is a legacy thing, as it is
   * easier for us to have this here, rather than changing the labels (which
   * requires new translations to be made).
   */
  isUpperCase?: boolean;
  /** Additional class names. */
  className?: string;
  /** You don't need to pass the callback for `isSubmit` option. */
  onClick?: (event: any) => void;
  'data-cy'?: string;
}

interface AdditionalButtonAttributes {
  'data-tip'?: string;
  'data-cy'?: string;
}

/**
 * A button component.
 */
const Button = (props: ButtonProps) => {
  const labelId = useId();
  // Note: both icon(s) and label are optional, but in reality the button
  // needs at least one of them to work.
  if (!props.startIcon && !props.endIcon && !props.label) {
    throw new Error('Button is missing a required properties: icon or label!');
  }

  // Size depends on label being there or not
  let iconSize = ButtonToIconAloneMap.get(props.size);
  if (props.label) {
    iconSize = ButtonToIconMap.get(props.size);
  }

  // For the attributes that don't have a falsy value.
  const additionalButtonAttributes: AdditionalButtonAttributes = {};
  if (props['data-cy']) {
    additionalButtonAttributes['data-cy'] = props['data-cy'];
  }

  const handleClick = (event: React.BaseSyntheticEvent) => {
    if (!props.isDisabled && props.onClick) {
      props.onClick(event);
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event?.key === 'space' || event?.key === 'enter') {
      handleClick(event);
    }
  };

  const renderButton = () => (
    <button
      className={cx({
        ['k-button']: true,
        [`k-button--type-${props.type}`]: true,
        [`k-button--color-${props.color}`]: true,
        [`k-button--size-${props.size}`]: true,
        ['k-button--pending']: props.isPending,
        ['k-button--has-start-icon']: props.startIcon,
        // Ensures only one icon is being displayed.
        ['k-button--has-end-icon']: !props.startIcon && props.endIcon,
        ['k-button--has-label']: Boolean(props.label),
        ['k-button--full-width']: props.isFullWidth,
        ['k-button--upper-case']: props.isUpperCase,
      }, props.className)}
      type={props.isSubmit ? 'submit' : 'button'}
      aria-disabled={props.isDisabled}
      onClick={handleClick}
      onKeyUp={onKeyUp}
      aria-labelledby={props.label ? `k-button__label--${labelId}` : undefined}
      {...additionalButtonAttributes}
    >
      {props.startIcon && <Icon name={props.startIcon} size={iconSize} />}

      {props.label && (
        <label id={`k-button__label--${labelId}`} className='k-button__label'>
          {props.label}
        </label>
      )}

      {/* Ensures only one icon is being displayed.*/}
      {!props.startIcon && props.endIcon && (
        <Icon name={props.endIcon} size={iconSize} />
      )}

      {props.isPending && (
        <Icon name='spinner' size={iconSize} className='k-spin' />
      )}
    </button>
  );

  return (
    <>
      {props.tooltip !== undefined ? (
        <Tooltip
          text={props.tooltip}
          ariaLabel={props.tooltip}
          alignment={props.tooltipPosition}
        >
          {renderButton()}
        </Tooltip>
      ) : (
        renderButton()
      )}
    </>
  );
};

export default Button;
