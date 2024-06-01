import {
  Binding,
  Dispatch,
  createBinding,
  joinBindings,
  SetStateAction,
} from "@rbxts/react";
import { debounce, Debounced, DebounceOptions } from "@rbxts/set-timeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Bindable<T = unknown> = Binding<T> | NonNullable<T>;

type ComposeBindings<T extends Bindable[]> = {
  [K in keyof T]: T[K] extends Bindable<infer U> ? U : T[K];
};

type BindingCombiner<T extends Bindable[], U> = (
  ...values: ComposeBindings<T>
) => U;

export type Callback = (...args: Array<any>) => any;

type ConnectionLike =
  | { Disconnect(): void }
  | { disconnect(): void }
  | (() => void);

type EventLike<T extends Callback = Callback> =
  | { Connect(callback: T): ConnectionLike }
  | { connect(callback: T): ConnectionLike }
  | { subscribe(callback: T): ConnectionLike };

export interface Lerpable<T> {
  Lerp: (this: T, to: T, alpha: number) => T;
}

export type Predicate<T> = (previous: T | undefined, current: T) => boolean;

export interface UseDebounceOptions extends DebounceOptions {
  /**
   * The amount of time to wait before the first call.
   */
  wait?: number;
}

export interface UseDebounceResult<T extends Callback> {
  /**
   * The debounced function.
   */
  run: Debounced<T>;
  /**
   * Cancels delayed invocations to the callback.
   */
  cancel: () => void;
  /**
   * Immediately invokes delayed callback invocations.
   */
  flush: () => void;
  /**
   * Returns whether any invocations are pending.
   */
  pending: () => boolean;
}

/**
 * Multiplies transparency values together. Normally, multiplying transparency
 * values requires inverting them (to get opacity), multiplying them, and then
 * inverting them again. This function does that for you.
 * @param transparencies The transparencies to multiply.
 * @returns The multiplied transparency.
 */
export function blend(...transparencies: number[]) {
  let result = 1;

  for (const transparency of transparencies) {
    result *= 1 - transparency;
  }

  return 1 - result;
}

/**
 * Composes multiple bindings or values together into a single binding.
 * Calls the combiner function with the values of the bindings when any
 * of the bindings change.
 * @param ...bindings A list of bindings or values.
 * @param combiner The function that maps the bindings to a new value.
 * @returns A binding that returns the result of the combiner.
 */
export function composeBindings<T extends Bindable[], U>(
  ...bindings: [...T, BindingCombiner<T, U>]
): Binding<U>;

export function composeBindings<T>(
  ...values: [...Bindable[], BindingCombiner<Bindable[], T>]
): Binding<T> {
  const combiner = values.pop() as BindingCombiner<Bindable[], T>;
  const bindings = values.map(toBinding);

  return joinBindings(bindings).map((bindings) => combiner(...bindings));
}

/**
 * Returns whether the given value is a binding.
 * @param value The value to check.
 * @returns Whether the value is a binding.
 */
export function isBinding<T>(value: T | Binding<T>): value is Binding<T>;
export function isBinding<T = unknown>(value: unknown): value is Binding<T>;
export function isBinding(value: unknown): value is Binding<unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    "getValue" in value &&
    "map" in value
  );
}

export const isStrictEqual = (a: unknown, b: unknown) => a === b;

/**
 * Linearly interpolates between two numbers.
 * @param a The first number.
 * @param b The second number.
 * @param alpha The alpha value to use.
 * @returns The interpolated number.
 */
export function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

/**
 * Returns a binding that lerps between two values using the given binding as
 * the alpha.
 * @param binding The binding to use as the alpha.
 * @param from The value to lerp from.
 * @param to The value to lerp to.
 * @returns A binding that lerps between two values.
 */
export function lerpBinding<T extends number | Lerpable<any>>(
  binding: Binding<number> | number,
  from: T,
  to: T
): Binding<T> {
  return mapBinding(binding, (alpha) => {
    if (typeof from === "number") {
      return lerp(from, to as number, alpha);
    } else {
      return from.Lerp(to, alpha);
    }
  });
}
/**
 * Maps a value from one range to another.
 * @param value The value to map.
 * @param fromMin The minimum of the input range.
 * @param fromMax The maximum of the input range.
 * @param toMin The minimum of the output range.
 * @param toMax The maximum of the output range.
 * @returns The mapped value.
 */
export function map(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
) {
  return ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin) + toMin;
}

/**
 * Maps a binding to a new binding. If the given value is not a binding, it will
 * be passed to the mapper function and returned as a new binding.
 * @param binding The binding to map.
 * @param callback The mapper function.
 * @returns The mapped binding.
 */
export function mapBinding<T, U>(
  binding: T | Binding<T>,
  callback: (value: T) => U
): Binding<U> {
  if (isBinding(binding)) {
    return binding.map(callback);
  } else {
    const [result] = createBinding(callback(binding as T));
    return result;
  }
}

/**
 * Converts a value to a binding. If the given value is already a binding, it
 * will be returned as-is.
 * @param value The value to convert.
 * @returns The converted binding.
 */
export function toBinding<T>(value: T | Binding<T>): Binding<T> {
  if (isBinding(value)) {
    return value;
  } else {
    const [result] = createBinding(value);
    return result;
  }
}

export const useCamera = () => ({
  FieldOfView: 70,
  ViewportSize: new Vector2(1024, 768),
  GetPropertyChangedSignal: (property: string) => ({} as any)
});

/**
 * Creates a debounced function that delays invoking `callback` until after `wait`
 * seconds have elapsed since the last time the debounced function was invoked.
 * The `callback` is invoked with the last arguments provided to the debounced
 * function. Subsequent calls to the debounced function return the result of
 * the last `callback` invocation.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `debounce` and `throttle`.
 *
 * @param callback The function to debounce.
 * @param options The options object.
 * @returns The new debounced function.
 */
export function useDebounceCallback<T extends Callback>(
  callback: T,
  options: UseDebounceOptions = {}
): UseDebounceResult<T> {
  const callbackRef = useLatest(callback);

  const debounced = useMemo(() => {
    return debounce(
      (...args: unknown[]) => {
        return callbackRef.current(...args);
      },
      options.wait,
      options
    );
  }, []) as Debounced<T>;

  useUnmountEffect(() => {
    debounced.cancel();
  });

  return {
    run: debounced,
    cancel: debounced.cancel,
    flush: debounced.flush,
    pending: debounced.pending,
  };
}

/**
 * Delays updating `state` until after `wait` seconds have elapsed since the
 * last time the debounced function was invoked. Set to the most recently passed
 * `state` after the delay.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `debounce` and `throttle`.
 *
 * @param initialState The value to debounce.
 * @param options The options object.
 * @returns A tuple containing the debounced value and a function to update it.
 */
export function useDebounceState<T>(
  initialState: T,
  options?: UseDebounceOptions
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(initialState);

  return [state, useDebounceCallback(setState, options).run];
}

export function useEventListener<T extends EventLike>(
  event?: T,
  listener?: T extends EventLike<infer U> ? U : never,
  options: EventListenerOptions = {}
) {}

/**
 * Returns a mutable ref that points to the latest value of the input.
 *
 * Takes an optional `predicate` function as the second argument that receives
 * the previous and current value. If the predicate returns `false`, the values
 * are not equal, and the previous value is updated.
 *
 * @param value The value to track.
 * @returns A mutable reference to the value.
 */
export function useLatest<T>(
  value: T,
  predicate: Predicate<T> = isStrictEqual
) {
  const ref = useRef(value);

  useMemo(() => {
    if (!predicate(ref.current, value)) {
      ref.current = value;
    }
  }, [value]);

  return ref;
}

/**
 * Returns a memoized callback that wraps the latest version of the input
 * callback.
 * @param callback The callback to memoize.
 * @returns The memoized callback.
 */
export function useLatestCallback<T extends Callback>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: unknown[]) => {
    return callbackRef.current(...args);
  }, []) as T;
}

/**
 * Calls the callback when the component unmounts.
 * @param callback The callback to call.
 */
export function useUnmountEffect(callback: () => void) {
  const callbackRef = useLatest(callback);

  useEffect(() => {
    return () => {
      callbackRef.current();
    };
  }, []);
}

/**
 * Runs a callback when the component is re-rendered. Does not run on the
 * first render.
 * @param effect The callback to run.
 * @param dependencies The dependencies to watch for changes.
 */
export function useUpdateEffect(
  effect: () => (() => void) | void,
  dependencies?: unknown[]
) {
  const isMounted = useRef(false);

  useEffect(() => {
    if (isMounted.current) {
      return effect();
    } else {
      isMounted.current = true;
    }
  }, dependencies);
}
