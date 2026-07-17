package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"desktopcolors/counter/internal/ratelimit"
	"desktopcolors/counter/internal/server"
	"desktopcolors/counter/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: counter <serve|dump> [flags]")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "serve":
		serveCmd(os.Args[2:])
	case "dump":
		dumpCmd(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "counter: unknown subcommand %q\n", os.Args[1])
		os.Exit(2)
	}
}

func serveCmd(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:8787", "listen address")
	dbPath := fs.String("db", "./counter.db", "sqlite database path")
	_ = fs.Parse(args)

	st, err := store.Open(*dbPath)
	if err != nil {
		fatal("open store: %v", err)
	}
	defer st.Close()

	lim := ratelimit.New(ratelimit.Config{Capacity: 40, RefillPerSec: 0.5})
	stopSweep := make(chan struct{})
	go func() {
		tick := time.NewTicker(10 * time.Minute)
		defer tick.Stop()
		for {
			select {
			case <-tick.C:
				lim.Sweep(30 * time.Minute)
			case <-stopSweep:
				return
			}
		}
	}()

	srv := &http.Server{Addr: *addr, Handler: server.New(st, lim).Handler()}

	go func() {
		fmt.Fprintf(os.Stderr, "counter: serving on %s (db %s)\n", *addr, *dbPath)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fatal("serve: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	close(stopSweep)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	fmt.Fprintln(os.Stderr, "counter: stopped")
}

func dumpCmd(args []string) {
	fs := flag.NewFlagSet("dump", flag.ExitOnError)
	dbPath := fs.String("db", "./counter.db", "sqlite database path")
	out := fs.String("out", "scores.json", `output path, or "-" for stdout`)
	_ = fs.Parse(args)

	st, err := store.Open(*dbPath)
	if err != nil {
		fatal("open store: %v", err)
	}
	defer st.Close()

	scores, err := st.Dump()
	if err != nil {
		fatal("dump: %v", err)
	}
	data, err := json.MarshalIndent(scores, "", "  ")
	if err != nil {
		fatal("marshal: %v", err)
	}
	data = append(data, '\n')

	if *out == "-" {
		_, _ = os.Stdout.Write(data)
		return
	}
	if err := os.WriteFile(*out, data, 0o644); err != nil {
		fatal("write %s: %v", *out, err)
	}
	fmt.Fprintf(os.Stderr, "counter: wrote %s (%d colors, %d os)\n", *out, len(scores.Colors), len(scores.Os))
}

func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "counter: "+format+"\n", a...)
	os.Exit(1)
}
