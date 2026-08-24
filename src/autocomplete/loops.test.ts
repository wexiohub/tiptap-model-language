import { describe, expect, it } from "vitest";
import type { MlNamespace } from "../schema/namespaces";
import { fieldAt, loopVarFields, openLoopsAt, resolveLoopPath } from "./loops";
import { buildModelOptions } from "./options";

const ns: MlNamespace[] = [
  {
    key: "flow",
    label: "Flow",
    dynamic: true,
    fields: [
      { key: "order.summary", type: "string", label: "Order summary" },
      {
        key: "order.products",
        type: "array",
        label: "Order products",
        schema: [
          { key: "sku", type: "string", label: "SKU" },
          { key: "name", type: "string", label: "Name" },
          { key: "price", type: "number", label: "Price" },
          {
            key: "variants",
            type: "array",
            label: "Variants",
            schema: [{ key: "color", type: "string", label: "Colour" }],
          },
        ],
      },
    ],
  },
  {
    key: "contact",
    label: "Contact",
    fields: [{ key: "first_name", type: "string", label: "First name" }],
  },
];

describe("openLoopsAt", () => {
  it("reports the loop the cursor sits inside", () => {
    expect(openLoopsAt("{{for product in flow.order.products}}{{")).toEqual([
      { name: "product", path: "flow.order.products" },
    ]);
  });

  it("forgets a loop that already closed", () => {
    const text = "{{for p in flow.order.products}}x{{/for}}{{";
    expect(openLoopsAt(text)).toEqual([]);
  });

  it("keeps nesting order, outermost first", () => {
    const text =
      "{{for product in flow.order.products}}{{for v in product.variants}}{{";
    expect(openLoopsAt(text)).toEqual([
      { name: "product", path: "flow.order.products" },
      { name: "v", path: "product.variants" },
    ]);
  });

  it("ignores a half-typed loop header", () => {
    expect(openLoopsAt("{{for }}{{")).toEqual([]);
  });
});

describe("resolveLoopPath", () => {
  const loops = [
    { name: "product", path: "flow.order.products" },
    { name: "v", path: "product.variants" },
  ];

  it("rewrites a loop variable to what it iterates", () => {
    expect(resolveLoopPath(loops, "product.name")).toBe(
      "flow.order.products.name",
    );
  });

  it("unwinds a loop over a loop variable", () => {
    expect(resolveLoopPath(loops, "v.color")).toBe(
      "flow.order.products.variants.color",
    );
  });

  it("rewrites the bare variable, with no field after it", () => {
    expect(resolveLoopPath(loops, "product")).toBe("flow.order.products");
  });

  it("terminates on bindings that reference each other", () => {
    // Not a document anyone writes on purpose, but the rewrite must not spin.
    const cyclic = [
      { name: "a", path: "b.x" },
      { name: "b", path: "a.y" },
    ];
    expect(typeof resolveLoopPath(cyclic, "a.z")).toBe("string");
  });

  it("leaves a real path alone", () => {
    expect(resolveLoopPath(loops, "contact.first_name")).toBe(
      "contact.first_name",
    );
  });

  it("gives the nearest loop the name", () => {
    const shadowed = [
      { name: "x", path: "flow.order.products" },
      { name: "x", path: "flow.order.products.variants" },
    ];
    expect(resolveLoopPath(shadowed, "x.color")).toBe(
      "flow.order.products.variants.color",
    );
  });
});

describe("fieldAt", () => {
  it("prefers a flat key over a walk", () => {
    expect(fieldAt(ns, "flow.order.summary")?.label).toBe("Order summary");
  });

  it("steps into an array's element schema", () => {
    expect(fieldAt(ns, "flow.order.products.price")?.type).toBe("number");
  });

  it("steps through nested arrays", () => {
    expect(fieldAt(ns, "flow.order.products.variants.color")?.label).toBe(
      "Colour",
    );
  });

  it("returns nothing for a field the schema does not have", () => {
    expect(fieldAt(ns, "flow.order.products.nope")).toBeUndefined();
  });

  it("returns nothing when no field prefixes the path", () => {
    expect(fieldAt(ns, "flow.nothing.here")).toBeUndefined();
  });

  it("takes the longest field key when several prefix the path", () => {
    // `order` and `order.products` both prefix the path; only the longer one
    // has the element schema that resolves `name`.
    const overlapping: MlNamespace[] = [
      {
        key: "flow",
        label: "Flow",
        fields: [
          {
            key: "order",
            type: "object",
            label: "Order",
            schema: [{ key: "products", type: "array", label: "Wrong one" }],
          },
          ...ns[0].fields,
        ],
      },
    ];
    expect(fieldAt(overlapping, "flow.order.products.name")?.label).toBe(
      "Name",
    );
  });

  it("returns nothing for an unknown namespace or a bare name", () => {
    expect(fieldAt(ns, "nope.field")).toBeUndefined();
    expect(fieldAt(ns, "contact")).toBeUndefined();
    // A trailing dot: a namespace and nothing after it.
    expect(fieldAt(ns, "contact.")).toBeUndefined();
  });
});

describe("loopVarFields", () => {
  it("offers the element's fields under the loop variable", () => {
    const paths = loopVarFields(ns, [
      { name: "product", path: "flow.order.products" },
    ]).map((e) => e.path);
    expect(paths).toEqual([
      "product.sku",
      "product.name",
      "product.price",
      "product.variants",
    ]);
  });

  it("offers nothing for a loop over something with no element schema", () => {
    // `contact.first_name` is a string: iterating it yields no fields, and
    // the completion list simply stays empty rather than guessing.
    expect(
      loopVarFields(ns, [{ name: "c", path: "contact.first_name" }]),
    ).toEqual([]);
  });

  it("resolves an inner loop through the outer one", () => {
    const paths = loopVarFields(ns, [
      { name: "product", path: "flow.order.products" },
      { name: "v", path: "product.variants" },
    ]).map((e) => e.path);
    expect(paths).toContain("v.color");
  });
});

describe("buildModelOptions — inside a loop", () => {
  const loops = [{ name: "product", path: "flow.order.products" }];
  const labels = (q: string, l = loops) =>
    buildModelOptions(ns, q, [], undefined, undefined, l).map((o) => o.label);

  it("completes the loop variable's fields", () => {
    expect(labels("product.")).toContain("product.name");
  });

  it("offers loop metadata only inside a loop", () => {
    expect(labels("loop.")).toContain("loop.index");
    expect(labels("loop.", [])).not.toContain("loop.index");
  });

  it("does not offer loop fields outside a loop", () => {
    expect(labels("product.", [])).not.toContain("product.name");
  });

  it("knows the type behind a loop variable, so filters are type-aware", () => {
    // `price` is a number: numeric operators must be on offer after it.
    const ops = buildModelOptions(
      ns,
      "if product.price ",
      [],
      undefined,
      undefined,
      loops,
    ).map((o) => o.label);
    expect(ops.some((l) => l.includes(">"))).toBe(true);
  });

  it("offers filters after a loop-metadata path, typed as a number", () => {
    // Exercises the metadata lookup: `loop.index` has to resolve to a field
    // for the filter stage to know it is a number.
    const opts = buildModelOptions(
      ns,
      "loop.index ",
      [],
      undefined,
      undefined,
      loops,
    ).map((o) => o.label);
    expect(opts).toContain("· insert ·");
    expect(opts).toContain("| round");
  });

  it("completes a nested loop's target from the outer variable", () => {
    expect(labels("for v in product.")).toContain("product.variants");
  });
});
