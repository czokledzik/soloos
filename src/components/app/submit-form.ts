import type { FormEvent } from "react";

/**
 * onSubmit handler that passes the form's data to `fn`. Used instead of
 * `<form action={…}>`, which resets every field once the action returns, even
 * when it returned a validation error, wiping what the user typed. Forms that
 * stay open after saving can call `form.reset()` themselves on success.
 */
export function submitForm(fn: (fd: FormData, form: HTMLFormElement) => unknown) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    fn(new FormData(form, (e.nativeEvent as SubmitEvent).submitter), form);
  };
}
