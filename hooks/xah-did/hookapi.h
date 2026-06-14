/**
 * Minimal Xahau Hook API surface used by did_hook.c.
 *
 * The real SDK header (xrpl-hooks) is large; this trimmed version declares only
 * the imported functions and macros this hook needs, with the WebAssembly
 * import attributes the runtime expects (module "env"). It is enough to compile
 * the hook to wasm32 with clang for CI/repro builds. For production, build
 * against the upstream hookapi.h + hook-cleaner toolchain.
 */
#ifndef ZEROQUERY_HOOKAPI_H
#define ZEROQUERY_HOOKAPI_H

typedef signed long long int64_t;
typedef unsigned long long uint64_t;
typedef signed int int32_t;
typedef unsigned int uint32_t;
typedef unsigned char uint8_t;

#define IMPORT(name) \
  __attribute__((import_module("env"), import_name(name)))

/* --- Hook return / control --- */
IMPORT("accept")   extern int64_t accept(uint32_t read_ptr, uint32_t read_len, int64_t error_code);
IMPORT("rollback") extern int64_t rollback(uint32_t read_ptr, uint32_t read_len, int64_t error_code);
IMPORT("trace")    extern int64_t trace(uint32_t mread_ptr, uint32_t mread_len,
                                         uint32_t dread_ptr, uint32_t dread_len, uint32_t as_hex);

/* --- Context / originating transaction --- */
IMPORT("hook_account") extern int64_t hook_account(uint32_t write_ptr, uint32_t write_len);
IMPORT("otxn_param")   extern int64_t otxn_param(uint32_t write_ptr, uint32_t write_len,
                                                 uint32_t read_ptr, uint32_t read_len);
IMPORT("ledger_last_time") extern int64_t ledger_last_time(void);

/* --- Hash --- */
IMPORT("util_sha512h") extern int64_t util_sha512h(uint32_t write_ptr, uint32_t write_len,
                                                   uint32_t read_ptr, uint32_t read_len);

/* --- Hook state (per-account namespace) --- */
IMPORT("state")     extern int64_t state(uint32_t write_ptr, uint32_t write_len,
                                         uint32_t kread_ptr, uint32_t kread_len);
IMPORT("state_set") extern int64_t state_set(uint32_t read_ptr, uint32_t read_len,
                                             uint32_t kread_ptr, uint32_t kread_len);

/* Convenience: pointer + length of a stack buffer / string literal. */
#define SBUF(x) (uint32_t)(x), sizeof(x)
#define SVAR(x) (uint32_t)(&x), sizeof(x)

/* Common hook error sentinels (subset). */
#define DOESNT_EXIST (-5)
#define TOO_SMALL    (-4)

#endif /* ZEROQUERY_HOOKAPI_H */
