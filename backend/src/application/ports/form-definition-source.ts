export interface FormDefinitionSource {
  findById(formId: string): Promise<unknown | undefined>;
}
